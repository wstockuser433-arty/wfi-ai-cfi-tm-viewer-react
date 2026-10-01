import { X, Monitor, Moon, Sun, RotateCcw, Server, Check } from "lucide-react";
import { useEffect } from "react";
import { useSettings, type ThemeMode } from "@/store/settingsStore";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

const THEMES: { value: ThemeMode; label: string; Icon: typeof Sun; hint: string }[] = [
  { value: "light",  label: "Light",  Icon: Sun,     hint: "Daylight — Clean Clinical palette" },
  { value: "dark",   label: "Dark",   Icon: Moon,    hint: "Night-shift friendly" },
  { value: "system", label: "System", Icon: Monitor, hint: "Follow OS preference" },
];

export function SettingsDrawer({ open, onClose }: Props) {
  const { theme, setTheme, api, setApi, reset } = useSettings();

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity"
        aria-hidden
      />

      {/* Drawer */}
      <aside
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-[420px] max-w-[92vw]",
          "glass-strong border-l border-white/10 shadow-2xl",
          "flex flex-col",
          "animate-[slideIn_.18s_ease-out]"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 rounded"
            aria-label="Close settings"
          >
            <X className="w-4 h-4 text-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-6">
          {/* ─── Appearance ───────────────────────────────── */}
          <section>
            <h3 className="text-[11px] uppercase tracking-widest text-muted mb-3">
              Appearance
            </h3>

            <div className="space-y-2">
              {THEMES.map(({ value, label, Icon, hint }) => {
                const active = theme === value;
                return (
                  <label
                    key={value}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      active
                        ? "border-accent/40 bg-accent/5"
                        : "border-white/10 hover:bg-white/5"
                    )}
                  >
                    <input
                      type="radio"
                      name="theme"
                      value={value}
                      checked={active}
                      onChange={() => setTheme(value)}
                      className="sr-only"
                    />

                    {/* Custom radio dot */}
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors",
                        active
                          ? "border-accent bg-accent/20"
                          : "border-white/20"
                      )}
                    >
                      {active && <Check className="w-2.5 h-2.5 text-accent" strokeWidth={3} />}
                    </span>

                    <Icon
                      className={cn(
                        "mt-0.5 w-4 h-4 shrink-0",
                        active ? "text-accent" : "text-muted"
                      )}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-100">{label}</div>
                      <div className="text-[11px] text-muted mt-0.5">{hint}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          {/* ─── Backend connection ──────────────────────── */}
          <section>
            <h3 className="text-[11px] uppercase tracking-widest text-muted mb-3">
              Backend Connection
            </h3>

            <div className="space-y-3">
              <Field
                label="API base URL"
                value={api.apiBase}
                onChange={(v) => setApi({ apiBase: v })}
                placeholder="http://localhost:8000"
              />
              <Field
                label="WebSocket URL"
                value={api.wsUrl}
                onChange={(v) => setApi({ wsUrl: v })}
                placeholder="ws://localhost:8000/ws/telemetry"
              />
              <div className="text-[11px] text-muted leading-relaxed">
                Changing these requires a page reload to reconnect. The
                values here override the build-time defaults.
              </div>
            </div>
          </section>

          {/* ─── Info ────────────────────────────────────── */}
          <section>
            <h3 className="text-[11px] uppercase tracking-widest text-muted mb-3">
              About
            </h3>
            <div className="text-[11px] text-muted space-y-1.5 leading-relaxed">
              <div className="flex justify-between">
                <span>Application</span>
                <span className="mono text-slate-200">WFI-AI-CFI TM Viewer</span>
              </div>
              <div className="flex justify-between">
                <span>Version</span>
                <span className="mono text-slate-200">0.1.0</span>
              </div>
              <div className="flex justify-between">
                <span>Storage</span>
                <span className="mono text-slate-200">localStorage</span>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="h-14 flex items-center justify-between px-4 border-t border-white/5 shrink-0">
          <Button
            onClick={reset}
            className="flex items-center gap-1.5 text-xs"
            title="Restore defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore defaults
          </Button>
          <Button
            onClick={onClose}
            className="text-xs bg-accent/15 border-accent/30 text-accent hover:bg-accent/25"
          >
            Done
          </Button>
        </div>
      </aside>

      {/* Slide-in keyframe */}
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(24px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

// ─── Small local components ────────────────────────────────
function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-muted block mb-1">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full mono text-xs"
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
      />
    </label>
  );
}