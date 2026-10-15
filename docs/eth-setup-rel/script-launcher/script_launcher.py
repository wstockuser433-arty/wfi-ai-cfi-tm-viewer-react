#!/usr/bin/env python3
"""Script Launcher - a tiny, generic Tk front-end for command-line shell scripts.

Point it at a shell script and it builds a form from the script itself:

  * options come from the script's `getopts "..."` string (or, for scripts that
    parse arguments by hand, from the usage text);
  * labels / defaults / "(required)" come from the usage text, e.g.
        -p  UDP port                      (default $PORT)
    with $PORT resolved from the script's own `PORT=9200` line;
  * optional hints in the script's comments (plain comments for bash):
        # @launcher title: My Tool
        # @launcher about: One line shown under the title.
        # @launcher defaults: -n 0 -i 1 -v      <- what the form starts with
        # @launcher hide: -l -h                 <- options not shown in the form
        # @launcher required: -H                <- must be filled in before Start

The script is never executed to find this out - it is only read.
Anything the parser misses can still be typed into "Extra arguments".

Where it finds scripts (shown in the drop-down; more can be added with Browse):
  1. paths given on the command line
  2. *.sh files next to this program  (drop a new script next to it - no rebuild)
  3. scripts bundled into the executable by build_app.sh

Other modes (no GUI, handy for checking what was detected):
  script_launcher.py --list                  show which scripts it can see
  script_launcher.py --dump script.sh        print detected options as JSON
  script_launcher.py --run  script.sh [args] run the script and stream output
"""
from __future__ import annotations

import glob
import json
import os
import queue
import re
import shlex
import shutil
import signal
import subprocess
import sys
import threading
import time
from dataclasses import asdict, dataclass, field

APP_NAME = "script-launcher"
MAX_LOG_LINES = 5000
PARAM_MAX_H = 380          # parameter box grows to this height, then scrolls
FROZEN = bool(getattr(sys, "frozen", False))


# =============================================================================
# 1. Reading a script (pure Python, no Tk) ====================================
# =============================================================================
@dataclass
class Opt:
    flag: str                      # "-H" or "--host"
    takes_value: bool = False
    desc: str = ""
    default: object = None         # str for value options, bool for switches
    required: bool = False
    hidden: bool = False
    placeholder: str = ""


@dataclass
class Spec:
    path: str
    title: str
    about: str = ""
    interpreter: list = field(default_factory=lambda: ["bash"])
    opts: list = field(default_factory=list)
    has_getopts: bool = False


FLAG = r"(--[A-Za-z0-9][\w-]*|-[A-Za-z0-9])"
USAGE_PH = re.compile(r"^(\s*)" + FLAG + r"(?:\s*[,|]\s*" + FLAG + r")?[ =]+(<[^>]+>|[A-Z][A-Z0-9_]*)[ \t]{2,}(\S.*)$")
USAGE = re.compile(r"^(\s*)" + FLAG + r"(?:\s*[,|]\s*" + FLAG + r")?()[ \t]+(\S.*)$")
DIRECTIVE = re.compile(r"^\s*#\s*@launcher\s+([A-Za-z]+)\s*:\s*(.*?)\s*$")
DEFAULT_RE = re.compile(r"[\(\[]\s*defaults?\s*[:=]?\s*([^)\]]*?)\s*[\)\]]", re.I)
REQUIRED_RE = re.compile(r"[\(\[]\s*required\s*[\)\]]", re.I)
GETOPTS_RE = re.compile(r"getopts\s+([\"'])(.+?)\1")
ASSIGN_LINE = re.compile(r"^\s*(?:export\s+|readonly\s+|declare\s+(?:-\S+\s+)?)?[A-Za-z_]\w*=")
ASSIGN = re.compile(r"""(?:^|[;\s])(?:export\s+)?([A-Za-z_]\w*)=("(?:[^"\\]|\\.)*"|'[^']*'|[^\s;"'#]*)""")
FLAG_TOKEN = re.compile(r"^--?[A-Za-z][\w-]*$")


def shell_vars(code_lines):
    """Simple top-of-script assignments (FOO=1; BAR="x"). First assignment wins."""
    out: dict[str, str] = {}
    for ln in code_lines:
        if not ASSIGN_LINE.match(ln):
            continue
        ln = re.sub(r"\s+#.*$", "", ln)
        for m in ASSIGN.finditer(ln):
            name, val = m.group(1), m.group(2)
            if val[:1] in "\"'" and len(val) >= 2:
                val = val[1:-1]
            if "$(" in val or "`" in val:
                continue
            out.setdefault(name, val)
    return out


def resolve(text, variables):
    text = text.strip().strip("\"'")
    text = re.sub(r"\$\{?(\w+)\}?", lambda m: variables.get(m.group(1), m.group(0)), text)
    return None if "$" in text else text


def parse_getopts(code_text):
    m = GETOPTS_RE.search(code_text)
    if not m:
        return []
    s, out, i = m.group(2).lstrip(":"), [], 0
    while i < len(s):
        takes = i + 1 < len(s) and s[i + 1] == ":"
        out.append(("-" + s[i], takes))
        i += 2 if takes else 1
    return out


ECHO_RE = re.compile(r"""^\s*(?:echo|printf)\s+(?:-[eEn]+\s+)?(["'])(.*?)(?:\\n)?\1\s*(?:;.*|>&2.*|\|.*)?$""")


def unwrap(line):
    """echo "  -x  text"  ->  '  -x  text'  (so usage printed by echo/printf is found too)."""
    m = ECHO_RE.match(line)
    return m.group(2) if m else line


def parse_usage(lines):
    """Find '  -x  description' lines (heredoc usage text, echo'd usage, or comments)."""
    norm = [re.sub(r"^(\s*)#", r"\1 ", unwrap(l.rstrip("\n"))) for l in lines]
    found: dict[str, dict] = {}
    i = 0
    while i < len(norm):
        m = USAGE_PH.match(norm[i]) or USAGE.match(norm[i])
        if not m:
            i += 1
            continue
        indent = len(m.group(1).expandtabs())
        desc, j = m.group(5), i + 1
        while (j < len(norm) and norm[j].strip()
               and len(norm[j]) - len(norm[j].lstrip()) > indent
               and not (USAGE_PH.match(norm[j]) or USAGE.match(norm[j]))):
            desc += " " + norm[j].strip()
            j += 1
        rec = dict(desc=desc, placeholder=m.group(4) or "")
        for fl in (m.group(2), m.group(3)):
            if fl:
                found.setdefault(fl, rec)
        i = j
    return found


def norm_flag(tok):
    if tok.startswith("-"):
        return tok
    return "-" + tok if len(tok) == 1 else "--" + tok


def parse_flag_values(s):
    """'-n 0 -i 1 -v' -> {'-n': '0', '-i': '1', '-v': True}"""
    out, cur = {}, None
    try:
        toks = shlex.split(s)
    except ValueError:
        return out
    for t in toks:
        if FLAG_TOKEN.match(t):
            cur = t
            out[cur] = True
        elif cur is not None:
            out[cur] = t if out[cur] is True else out[cur] + " " + t
    return out


def interpreter_for(path):
    try:
        with open(path, "rb") as f:
            first = f.readline(256).decode("utf-8", "replace").strip()
    except OSError:
        first = ""
    if first.startswith("#!"):
        try:
            parts = shlex.split(first[2:].strip())
        except ValueError:
            parts = []
        if parts and (os.path.exists(parts[0]) or shutil.which(parts[0])):
            return parts
    return ["bash"]


def build_spec(path):
    path = os.path.abspath(path)
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        lines = f.read().splitlines()
    code = [l for l in lines if not l.lstrip().startswith("#")]
    variables = shell_vars(code)
    directives = {}
    for l in lines:
        m = DIRECTIVE.match(l)
        if m:
            directives[m.group(1).lower()] = m.group(2)

    getopt = parse_getopts("\n".join(code))
    usage = parse_usage(lines)

    opts: dict[str, Opt] = {}
    for flag, takes in getopt:
        opts[flag] = Opt(flag, takes)
    if not getopt:  # hand-written parser: trust usage text instead
        for flag, u in usage.items():
            opts.setdefault(flag, Opt(flag, bool(u["placeholder"])))

    for flag, o in opts.items():
        u = usage.get(flag)
        if not u:
            continue
        desc = u["desc"]
        dm = list(DEFAULT_RE.finditer(desc))
        if dm:
            o.default = resolve(dm[-1].group(1), variables)
            desc = DEFAULT_RE.sub("", desc)
        if REQUIRED_RE.search(desc):
            o.required = True
            desc = REQUIRED_RE.sub("", desc)
        o.desc = re.sub(r"\s+", " ", desc).strip(" ;,")
        o.placeholder = u["placeholder"]
        if not getopt and (o.default is not None):
            o.takes_value = True

    # @launcher hints override whatever was parsed
    for flag, val in parse_flag_values(directives.get("defaults", "")).items():
        if flag not in opts:
            opts[flag] = Opt(flag, val is not True)
        opts[flag].default = val if opts[flag].takes_value else bool(val)
        if opts[flag].takes_value and val is True:
            opts[flag].default = ""
    for tok in directives.get("hide", "").split():
        if norm_flag(tok) in opts:
            opts[norm_flag(tok)].hidden = True
    for tok in directives.get("required", "").split():
        if norm_flag(tok) in opts:
            opts[norm_flag(tok)].required = True
    for h in ("-h", "--help"):  # never show a help switch by default
        if h in opts and not opts[h].takes_value and "hide" not in directives:
            opts[h].hidden = True

    for o in opts.values():
        if o.takes_value and o.default is None:
            o.default = ""
        elif not o.takes_value and o.default is None:
            o.default = False

    ordered = sorted(opts.values(), key=lambda o: not o.required)  # stable
    base = os.path.splitext(os.path.basename(path))[0]
    return Spec(
        path=path,
        title=directives.get("title") or base.replace("_", " ").replace("-", " ").title(),
        about=directives.get("about", ""),
        interpreter=interpreter_for(path),
        opts=ordered,
        has_getopts=bool(getopt),
    )


def build_args(spec, values, extra=""):
    """values: {flag: str|bool}. Returns (args, missing_required_flags, error)."""
    args, missing = [], []
    for o in spec.opts:
        v = values.get(o.flag, o.default)
        if o.takes_value:
            v = str(v).strip()
            if v == "":
                if o.required:
                    missing.append(o.flag)
                continue
            args += [o.flag, v]
        elif v:
            args.append(o.flag)
    try:
        args += shlex.split(extra or "")
    except ValueError as e:
        return args, missing, f"extra arguments: {e}"
    return args, missing, None


# =============================================================================
# 2. Running a script (pure Python, no Tk) ====================================
# =============================================================================
def child_env():
    env = dict(os.environ)
    env["PYTHONUNBUFFERED"] = "1"
    if FROZEN:  # undo PyInstaller's library-path tweak so system tools (bash, sed, dd) work
        orig = env.pop("LD_LIBRARY_PATH_ORIG", None)
        if orig is not None:
            env["LD_LIBRARY_PATH"] = orig
        else:
            env.pop("LD_LIBRARY_PATH", None)
    return env


class Runner:
    """Runs one process in its own process group; output lines arrive on .q.
    The queue carries str lines, then finally the Popen object when it has exited."""

    def __init__(self):
        self.proc = None
        self.q: queue.Queue = queue.Queue()
        self.started = 0.0
        self.stopping = False

    @property
    def running(self):
        return self.proc is not None and self.proc.poll() is None

    def start(self, cmd, cwd):
        self.stopping = False
        self.proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL,
            cwd=cwd, env=child_env(), start_new_session=True)
        self.started = time.time()
        threading.Thread(target=self._pump, args=(self.proc,), daemon=True).start()

    def _pump(self, proc):
        try:
            for raw in iter(proc.stdout.readline, b""):
                self.q.put(raw.decode("utf-8", "replace"))
        finally:
            proc.stdout.close()
            proc.wait()
            self.q.put(proc)

    def _signal(self, sig):
        if self.proc is not None and self.proc.poll() is None:
            try:
                os.killpg(self.proc.pid, sig)
            except (ProcessLookupError, PermissionError):
                pass

    def terminate(self):
        self.stopping = True
        self._signal(signal.SIGTERM)

    def kill(self):
        self.stopping = True
        self._signal(signal.SIGKILL)


# =============================================================================
# 3. Settings + script discovery ==============================================
# =============================================================================
def app_dir():
    p = sys.executable if FROZEN else __file__
    return os.path.dirname(os.path.realpath(p))


def cfg_path(name):
    base = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
    return os.path.join(base, APP_NAME, re.sub(r"[^\w.-]", "_", name) + ".json")


def load_cfg(name):
    try:
        with open(cfg_path(name), "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_cfg(name, data):
    try:
        p = cfg_path(name)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=1)
    except OSError:
        pass


def discover(cli_paths):
    """name -> path. Bundled first, then files next to the app (override), then CLI paths."""
    cands: dict[str, str] = {}
    dirs = []
    if FROZEN and getattr(sys, "_MEIPASS", None):
        dirs.append(os.path.join(sys._MEIPASS, "scripts"))
    dirs.append(app_dir())
    for d in dirs:
        for p in sorted(glob.glob(os.path.join(d, "*.sh"))):
            cands[os.path.basename(p)] = p
    for p in cli_paths:
        if os.path.isfile(p):
            cands[os.path.basename(p)] = os.path.abspath(p)
    return cands


# =============================================================================
# 4. The window ================================================================
# =============================================================================
def run_gui(cli_paths):
    try:
        import tkinter as tk
        import tkinter.font as tkfont
        from tkinter import filedialog, messagebox, ttk
    except ImportError:
        sys.exit("Tk is not installed.  Fix:  sudo apt install python3-tk")

    ERR_RE = re.compile(r"\b(error|failed|fail|denied|not found|no such|unknown)\b", re.I)

    class App:
        def __init__(self, root, cands, first):
            self.root = root
            self.cands = cands
            self.spec = None
            self.vars, self.entries, self.inputs = {}, {}, []
            self.saved = {}
            self.runner = Runner()
            self._build(first)
            root.protocol("WM_DELETE_WINDOW", self.on_close)
            root.after(80, self._poll)
            root.after(500, self._tick)

        # ---------- layout ----------
        def _build(self, first):
            r = self.root
            r.title("Script Launcher")
            r.geometry("880x780")
            r.minsize(700, 560)
            style = ttk.Style(r)
            try:
                style.theme_use("clam")
            except tk.TclError:
                pass
            style.configure("Bad.TEntry", fieldbackground="#ffd6d6")
            base = tkfont.nametofont("TkDefaultFont")
            sz = base.cget("size")
            self.f_title = base.copy()
            self.f_title.configure(weight="bold", size=int(sz * 1.45) if sz else 14)
            self.f_bold = base.copy()
            self.f_bold.configure(weight="bold")
            self.f_mono = tkfont.nametofont("TkFixedFont").copy()
            self.f_mono_b = self.f_mono.copy()
            self.f_mono_b.configure(weight="bold")

            outer = ttk.Frame(r, padding=10)
            outer.pack(fill="both", expand=True)

            row = ttk.Frame(outer)
            row.pack(fill="x")
            ttk.Label(row, text="Script:").pack(side="left")
            self.script_var = tk.StringVar()
            self.script_cb = ttk.Combobox(row, textvariable=self.script_var, state="readonly",
                                          values=list(self.cands))
            self.script_cb.pack(side="left", fill="x", expand=True, padx=6)
            self.script_cb.bind("<<ComboboxSelected>>", lambda e: self.load_script(self.cands[self.script_var.get()]))
            self.reload_btn = ttk.Button(row, text="Reload", width=8, command=self.reload)
            self.reload_btn.pack(side="left")
            self.browse_btn = ttk.Button(row, text="Browse…", command=self.browse)
            self.browse_btn.pack(side="left", padx=(6, 0))

            self.title_lbl = ttk.Label(outer, font=self.f_title)
            self.title_lbl.pack(anchor="w", pady=(10, 0))
            self.about_lbl = ttk.Label(outer, foreground="#555", wraplength=800, justify="left")
            self.about_lbl.pack(anchor="w")

            box = ttk.LabelFrame(outer, text="Parameters", padding=6)
            box.pack(fill="x", pady=(8, 0))
            self.canvas = tk.Canvas(box, highlightthickness=0, height=100)
            self.vsb = ttk.Scrollbar(box, orient="vertical", command=self.canvas.yview)
            self.canvas.configure(yscrollcommand=self.vsb.set)
            self.canvas.pack(side="left", fill="both", expand=True)
            self.inner = ttk.Frame(self.canvas)
            self.canvas.create_window((0, 0), window=self.inner, anchor="nw", tags="inner")
            self.inner.bind("<Configure>", lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")))
            self.canvas.bind("<Configure>", lambda e: self.canvas.itemconfigure("inner", width=e.width))
            self.canvas.bind("<Enter>", lambda e: self._wheel(True))
            self.canvas.bind("<Leave>", lambda e: self._wheel(False))
            self.inner.columnconfigure(2, weight=1)

            ex = ttk.Frame(outer)
            ex.pack(fill="x", pady=(8, 0))
            ttk.Label(ex, text="Extra arguments:").pack(side="left")
            self.extra_var = tk.StringVar()
            self.extra_var.trace_add("write", lambda *a: self.update_preview())
            self.extra_entry = ttk.Entry(ex, textvariable=self.extra_var)
            self.extra_entry.pack(side="left", fill="x", expand=True, padx=6)

            cm = ttk.Frame(outer)
            cm.pack(fill="x", pady=(6, 0))
            ttk.Label(cm, text="Command:").pack(side="left")
            self.cmd_var = tk.StringVar()
            ttk.Entry(cm, textvariable=self.cmd_var, state="readonly", font=self.f_mono).pack(
                side="left", fill="x", expand=True, padx=6)
            ttk.Button(cm, text="Copy", width=7, command=self.copy_cmd).pack(side="left")

            bt = ttk.Frame(outer)
            bt.pack(fill="x", pady=(10, 6))
            self.start_btn = ttk.Button(bt, text="▶  Start", command=self.start, width=12)
            self.start_btn.pack(side="left")
            self.stop_btn = ttk.Button(bt, text="■  Stop", command=self.stop, width=12)
            self.stop_btn.pack(side="left", padx=6)
            self.reset_btn = ttk.Button(bt, text="Reset defaults", command=self.reset)
            self.reset_btn.pack(side="left", padx=(12, 0))
            ttk.Button(bt, text="Clear log", command=self.clear_log).pack(side="left", padx=6)
            self.status = ttk.Label(bt, text="Ready", font=self.f_bold)
            self.status.pack(side="right")

            lf = ttk.Frame(outer)
            lf.pack(fill="both", expand=True)
            self.log = tk.Text(lf, height=10, wrap="none", state="disabled", bg="#14181f", fg="#d8dee9",
                               insertbackground="#d8dee9", relief="flat", font=self.f_mono, padx=6, pady=4)
            lsb = ttk.Scrollbar(lf, orient="vertical", command=self.log.yview)
            lsx = ttk.Scrollbar(lf, orient="horizontal", command=self.log.xview)
            self.log.configure(yscrollcommand=lsb.set, xscrollcommand=lsx.set)
            lsb.pack(side="right", fill="y")
            lsx.pack(side="bottom", fill="x")
            self.log.pack(side="left", fill="both", expand=True)
            self.log.tag_configure("err", foreground="#ff7b72")
            self.log.tag_configure("info", foreground="#7ee787")

            self._set_running(False)
            if first:
                self.script_var.set(first)
                self.load_script(self.cands[first])
            else:
                self.title_lbl.configure(text="No script selected")
                self.about_lbl.configure(text="Use Browse… to choose a shell script, or put a .sh file next to this program.")

        def _wheel(self, on):
            if on:
                self.root.bind_all("<Button-4>", lambda e: self.canvas.yview_scroll(-2, "units"))
                self.root.bind_all("<Button-5>", lambda e: self.canvas.yview_scroll(2, "units"))
                self.root.bind_all("<MouseWheel>", lambda e: self.canvas.yview_scroll(-1 * (e.delta // 120), "units"))
            else:
                for s in ("<Button-4>", "<Button-5>", "<MouseWheel>"):
                    self.root.unbind_all(s)

        # ---------- loading a script ----------
        def load_script(self, path, keep_values=False):
            try:
                spec = build_spec(path)
            except OSError as e:
                messagebox.showerror("Cannot read script", str(e))
                return
            self.spec = spec
            name = os.path.basename(path)
            self.saved = load_cfg(name) if not keep_values else self.saved
            self.root.title(f"{spec.title} - Script Launcher")
            self.title_lbl.configure(text=spec.title)
            self.about_lbl.configure(text=spec.about)
            self._build_params()
            self.extra_var.set(self.saved.get("extra", ""))
            save_cfg("app", {"last_script": name})
            self.update_preview()
            self.set_status("Ready", "#444")

        def _build_params(self):
            for w in self.inner.winfo_children():
                w.destroy()
            self.vars.clear(); self.entries.clear(); self.inputs.clear()
            saved = self.saved.get("values", {})
            visible = [o for o in self.spec.opts if not o.hidden]
            if not visible:
                ttk.Label(self.inner, foreground="#666",
                          text='No options detected. Type any arguments into "Extra arguments" below.').grid(
                    row=0, column=0, columnspan=3, sticky="w", padx=4, pady=6)
            for i, o in enumerate(visible):
                val = saved.get(o.flag, o.default)
                kw = {"foreground": "#b00020"} if o.required else {}
                ttk.Label(self.inner, text=o.flag + (" *" if o.required else ""), font=self.f_mono_b, **kw).grid(
                    row=i, column=0, sticky="e", padx=(2, 8), pady=1)
                if o.takes_value:
                    var = tk.StringVar(value=str(val))
                    w = ttk.Entry(self.inner, textvariable=var, width=28)
                    self.entries[o.flag] = w
                else:
                    var = tk.BooleanVar(value=bool(val))
                    w = ttk.Checkbutton(self.inner, variable=var)
                w.grid(row=i, column=1, sticky="w", pady=1)
                var.trace_add("write", lambda *a, f=o.flag: self._edited(f))
                ttk.Label(self.inner, text=o.desc, foreground="#666", wraplength=430, justify="left").grid(
                    row=i, column=2, sticky="w", padx=(10, 4), pady=1)
                self.vars[o.flag] = var
                self.inputs.append(w)
            self.root.update_idletasks()
            h = self.inner.winfo_reqheight()
            self.canvas.configure(height=min(max(h, 30), PARAM_MAX_H))
            if h > PARAM_MAX_H:
                self.vsb.pack(side="right", fill="y")
            else:
                self.vsb.pack_forget()
            self.canvas.yview_moveto(0)

        # ---------- values / command ----------
        def values(self):
            return {f: v.get() for f, v in self.vars.items()}

        def current_args(self):
            vals = {o.flag: o.default for o in self.spec.opts}   # hidden options keep their defaults
            vals.update(self.values())
            return build_args(self.spec, vals, self.extra_var.get())

        def _edited(self, flag):
            e = self.entries.get(flag)
            if e is not None:
                e.configure(style="TEntry")
            self.update_preview()

        def update_preview(self):
            if not self.spec:
                self.cmd_var.set("")
                return
            args, _missing, err = self.current_args()
            shown = " ".join(shlex.quote(a) for a in ["./" + os.path.basename(self.spec.path)] + args)
            self.cmd_var.set(shown if not err else f"({err})")

        def copy_cmd(self):
            self.root.clipboard_clear()
            self.root.clipboard_append(self.cmd_var.get())
            self.set_status("Command copied", "#444")

        def reset(self):
            for o in self.spec.opts:
                if o.flag in self.vars:
                    self.vars[o.flag].set(o.default if o.takes_value else bool(o.default))
            self.extra_var.set("")

        # ---------- run control ----------
        def start(self):
            if not self.spec or self.runner.running:
                return
            args, missing, err = self.current_args()
            if err:
                self.set_status(err, "#b00020")
                return
            if missing:
                for f in missing:
                    if f in self.entries:
                        self.entries[f].configure(style="Bad.TEntry")
                if missing[0] in self.entries:
                    self.entries[missing[0]].focus_set()
                self.set_status("Required: " + " ".join(missing), "#b00020")
                return
            self.save_settings()
            cmd = self.spec.interpreter + [self.spec.path] + args
            self._log("$ " + self.cmd_var.get() + "\n", "info")
            try:
                self.runner.start(cmd, cwd=app_dir())
            except OSError as e:
                self._log(f"Could not start: {e}\n", "err")
                self.set_status("Could not start", "#b00020")
                return
            self._set_running(True)

        def stop(self):
            if not self.runner.running:
                return
            self.runner.terminate()
            self.set_status("Stopping…", "#b26a00")
            self.root.after(2500, lambda: self.runner.running and self.runner.kill())

        def _finished(self, proc):
            if self.runner.proc is not proc:
                return
            rc = proc.returncode
            took = self._elapsed()
            if self.runner.stopping:
                self._log(f"[stopped after {took}]\n", "info")
                self.set_status(f"Stopped ({took})", "#444")
            elif rc == 0:
                self._log(f"[finished, exit code 0, {took}]\n", "info")
                self.set_status(f"Finished ({took})", "#15803d")
            else:
                self._log(f"[exited with code {rc}, {took}]\n", "err")
                self.set_status(f"Exited with code {rc}", "#b00020")
            self.runner.proc = None
            self._set_running(False)

        def _set_running(self, running):
            def st(w, on):
                w.state(["!disabled"] if on else ["disabled"])
            st(self.start_btn, not running)
            st(self.stop_btn, running)
            for w in self.inputs + [self.extra_entry, self.script_cb, self.browse_btn, self.reload_btn, self.reset_btn]:
                st(w, not running)
            if running:
                self.set_status("Running…", "#15803d")

        def _elapsed(self):
            s = int(time.time() - self.runner.started)
            return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"

        def _tick(self):
            if self.runner.running and not self.runner.stopping:
                self.set_status(f"Running - {self._elapsed()}  (PID {self.runner.proc.pid})", "#15803d")
            self.root.after(500, self._tick)

        def set_status(self, text, color="#444"):
            self.status.configure(text=text, foreground=color)

        # ---------- log ----------
        def _poll(self):
            chunks, done = [], None
            try:
                for _ in range(400):
                    item = self.runner.q.get_nowait()
                    if isinstance(item, str):
                        chunks.append(item)
                    else:
                        done = item
            except queue.Empty:
                pass
            if chunks:
                self._log("".join(chunks))
            if done is not None:
                self._finished(done)
            self.root.after(60, self._poll)

        def _log(self, text, tag=None):
            at_bottom = self.log.yview()[1] > 0.995
            self.log.configure(state="normal")
            for line in text.splitlines(True):
                t = tag or ("err" if ERR_RE.search(line) else None)
                self.log.insert("end", line, t or ())
            n = int(self.log.index("end-1c").split(".")[0])
            if n > MAX_LOG_LINES:
                self.log.delete("1.0", f"{n - MAX_LOG_LINES}.0")
            self.log.configure(state="disabled")
            if at_bottom:
                self.log.see("end")

        def clear_log(self):
            self.log.configure(state="normal")
            self.log.delete("1.0", "end")
            self.log.configure(state="disabled")

        # ---------- misc ----------
        def browse(self):
            p = filedialog.askopenfilename(
                title="Choose a shell script", initialdir=app_dir(),
                filetypes=[("Shell scripts", "*.sh"), ("All files", "*")])
            if p:
                name = os.path.basename(p)
                self.cands[name] = p
                self.script_cb.configure(values=list(self.cands))
                self.script_var.set(name)
                self.load_script(p)

        def reload(self):
            if self.spec:
                self.save_settings()
                self.load_script(self.spec.path)

        def save_settings(self):
            if self.spec:
                save_cfg(os.path.basename(self.spec.path),
                         {"values": self.values(), "extra": self.extra_var.get()})

        def on_close(self):
            if self.runner.running:
                if not messagebox.askyesno("Quit", "The script is still running.\nStop it and quit?"):
                    return
                self.runner.terminate()
                t0 = time.time()
                while self.runner.running and time.time() - t0 < 1.5:
                    time.sleep(0.05)
                self.runner.kill()
            self.save_settings()
            self.root.destroy()

    cands = discover(cli_paths)
    last = load_cfg("app").get("last_script")
    first = (os.path.basename(cli_paths[0]) if cli_paths and os.path.isfile(cli_paths[0])
             else last if last in cands else next(iter(cands), None))
    root = tk.Tk()
    app = App(root, cands, first)
    root.app = app  # (handle for automated tests)
    if first is None:
        root.after(200, app.browse)
    root.mainloop()


# =============================================================================
# 5. Command line ==============================================================
# =============================================================================
def main(argv):
    if argv and argv[0] in ("-h", "--help"):
        print(__doc__)
        return 0
    if argv and argv[0] == "--list":
        for name, path in discover(argv[1:]).items():
            print(f"{name}  ->  {path}")
        return 0
    if argv and argv[0] == "--dump":
        for p in argv[1:]:
            spec = build_spec(p)
            print(json.dumps(asdict(spec), indent=2))
        return 0
    if argv and argv[0] == "--run":
        if len(argv) < 2:
            print("usage: --run script.sh [args...]")
            return 2
        spec = build_spec(argv[1])
        r = Runner()
        r.start(spec.interpreter + [spec.path] + argv[2:], cwd=app_dir())
        try:
            while True:
                item = r.q.get()
                if isinstance(item, str):
                    sys.stdout.write(item)
                    sys.stdout.flush()
                else:
                    return item.returncode
        except KeyboardInterrupt:
            r.terminate()
            return 130
    run_gui(argv)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
