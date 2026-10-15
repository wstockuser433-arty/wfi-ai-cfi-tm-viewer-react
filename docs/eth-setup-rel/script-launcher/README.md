# Script Launcher

A tiny Tk window (Start / Stop, one text box per option, live log) for any shell
script. It reads the script to build the form, so a new script needs no UI code.

```
script_launcher.py   the whole app (one file, Python standard library only)
build_app.sh         turns it + your script(s) into ONE double-clickable file
send_pus_tm.sh       the PUS sender, with 4 optional "# @launcher" hint lines
```

## Make the single file (once, on PC2 - the Ubuntu 22.04 machine you work on)

```bash
sudo apt install python3-tk python3-venv python3-pip     # build machine only
chmod +x build_app.sh
./build_app.sh -o pus-sender send_pus_tm.sh
```

Result: `dist/pus-sender` (about 12 MB). Copy **just that file** to PC1 and
double-click it. PC1 needs nothing installed (Python and Tk are inside the file).

* Build on Ubuntu 22.04 (or older than the target). A file built on a newer
  Ubuntu can fail on an older one with a "GLIBC_x.y not found" error.
* If double-click does nothing: right-click the file -> Properties -> Permissions
  -> "Allow executing file as program" (copying by USB or scp can drop the
  executable bit), or run `chmod +x pus-sender`.
* Without building: `python3 script_launcher.py send_pus_tm.sh` works anywhere
  `python3-tk` is installed.

## A new script later

Same command, any script(s):

```bash
./build_app.sh -o my-tool-ui my_tool.sh            # new single file
./build_app.sh -o both-ui send_pus_tm.sh my_tool.sh # several scripts, picked from a drop-down
```

Or no rebuild at all: put the new `.sh` in the same folder as the app and it
appears in the **Script:** drop-down (a file there also overrides a bundled one
of the same name, so you can edit a script in place). **Browse...** picks any file.

## What it figures out by itself

It only *reads* the script (never runs it to ask for help):

| From the script | Becomes |
|---|---|
| `getopts "H:p:v"` | one field per option (`:` = takes a value, otherwise a checkbox) |
| usage text: `  -p  UDP port  (default $PORT)` - in a heredoc, `echo "..."` lines or comments | the description; `$PORT` is looked up from `PORT=9200` in the script |
| `(required)` in that text | red `*`; Start refuses until it is filled in |
| no getopts (hand-written parser) | options are taken from the usage text, e.g. `--name NAME  who to greet` |
| first line `#!/usr/bin/env bash` (or sh, python...) | the interpreter used |

Anything it misses: type it in **Extra arguments** (also the way to pass plain
positional arguments). The grey **Command** line shows exactly what will run.
Check what was detected without opening a window:
`./script_launcher.py --dump my_tool.sh`  (`--list` shows scripts it can see).

## Optional hints (ordinary comments, bash ignores them)

```bash
# @launcher title: PUS TM Packet Sender
# @launcher about: One line shown under the title.
# @launcher defaults: -n 0 -i 1 -v     # starting values (here: run forever)
# @launcher hide: -l -h                # options not shown in the form
# @launcher required: -H               # must be filled in
```

## Behaviour

* Stop sends SIGTERM to the script's whole process group (so a `sleep` it started
  dies too), then SIGKILL after 2.5 s. Closing the window while it runs asks first.
* Last-used values are remembered per script in `~/.config/script-launcher/`.
  "Reset defaults" returns to the script's own defaults.
* The log keeps the last 5000 lines. Lines containing "error"/"failed"/... are red.
* Output is shown as the script prints it. Scripts that need a terminal or input
  (prompts, `read`) are not supported - stdin is closed.
* The script runs with the app's folder as its working directory.
