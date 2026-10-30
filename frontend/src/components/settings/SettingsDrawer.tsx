import { X, Sun, Moon, Monitor, Check, RotateCcw, Server, CircleDot } from "lucide-react";
import { useEffect } from "react";
import { useSettings } from "@/store/settingsStore";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "light"  as const, label: "Light",  Icon: Sun,     hint: "Daylight — Clean Clinical palette" },
  { value: "dark"   as const, label: "Dark",   Icon: Moon,    hint: "Night-shift friendly" },
  { value: "system" as const, label: "System", Icon: Monitor, hint: "Follow OS preference" },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsDrawer({ open, onClose }: Props) {
  const {
    theme,
    setTheme,
    api,
    setApi,
    serial,
    fetchSerial,
    updateSerial,
    serialError,
    reset,
  } = useSettings();

  // Load config when the drawer opens
  useEffect(() => {
    if (open) fetchSerial();
  }, [open, fetchSerial]);

  // Poll for status updates every 2s while in serial mode
  useEffect(() => {
    if (!open || serial?.transport !== "serial") return;
    const id = setInterval(() => {
      fetchSerial();
    }, 2000);
    return () => clearInterval(id);
  }, [open, serial?.transport, fetchSerial]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll
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
          "fixed top-0 right-0 z-50 h-full w-[440px] max-w-[92vw]",
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
            <X className="w-4 h-4 text-tertiary" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-4 space-y-6">
          {/* ─── Appearance ───────────────────────────────── */}
          <section>
            <h3 className="text-[11px] uppercase tracking-widest text-tertiary mb-3">
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
                        active ? "text-accent" : "text-tertiary"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-primary">{label}</div>
                      <div className="text-[11px] text-tertiary mt-0.5">{hint}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </section>

          {/* ─── Backend connection ──────────────────────── */}
          <section>
            <h3 className="text-[11px] uppercase tracking-widest text-tertiary mb-3">
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
              <div className="text-[11px] text-tertiary leading-relaxed">
                Changing these requires a page reload to reconnect.
              </div>
            </div>
          </section>

          {/* ─── Data Source (Transport + Serial) ────────── */}
          <section>
            <h3 className="text-[11px] uppercase tracking-widest text-tertiary mb-3">
              Data Source
            </h3>

            {/* Transport selector */}
            <div className="space-y-2 mb-4">
              {([
                { value: "ethernet", label: "Ethernet (TCP + UDP)",
                  hint: "TCP :9100 / UDP :9200" },
                { value: "serial", label: "Serial RS-422",
                  hint: "Direct hardware connection" },
              ] as const).map(({ value, label, hint }) => {
                const active = serial?.transport === value;
                return (
                  <label key={value}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      active
                        ? "border-accent/40 bg-accent/5"
                        : "border-white/10 hover:bg-white/5"
                    )}>
                    <input
                      type="radio"
                      name="transport"
                      value={value}
                      checked={active}
                      onChange={() => updateSerial({ transport: value })}
                      className="sr-only"
                    />
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 w-4 h-4 rounded-full border flex items-center justify-center",
                        active ? "border-accent bg-accent/20" : "border-white/20"
                      )}
                    >
                      {active && <Check className="w-2.5 h-2.5 text-accent" strokeWidth={3} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-primary">{label}</div>
                      <div className="text-[11px] text-tertiary mt-0.5">{hint}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Serial params — visible when serial is selected */}
            {serial?.transport === "serial" && (
              <div className="space-y-3 border-t border-white/5 pt-3">
                <SerialField label="Port" value={serial.port}
                  onChange={(v) => updateSerial({ port: v })}
                  placeholder="/dev/ttyUSB0 or /tmp/ttyV1" />

                <div className="grid grid-cols-2 gap-3">
                  <SerialField label="Baud rate" type="number" value={serial.baudrate}
                    onChange={(v) => updateSerial({ baudrate: Number(v) })} />
                  <SerialSelect label="Data bits" value={String(serial.bytesize)}
                    options={["5", "6", "7", "8"]}
                    onChange={(v) => updateSerial({ bytesize: Number(v) })} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <SerialSelect label="Parity" value={serial.parity}
                    options={[
                      { value: "N", label: "None" },
                      { value: "E", label: "Even" },
                      { value: "O", label: "Odd" },
                      { value: "M", label: "Mark" },
                      { value: "S", label: "Space" },
                    ]}
                    onChange={(v) => updateSerial({ parity: v as any })} />
                  <SerialSelect label="Stop bits" value={String(serial.stopbits)}
                    options={[
                      { value: "1",   label: "1" },
                      { value: "1.5", label: "1.5" },
                      { value: "2",   label: "2" },
                    ]}
                    onChange={(v) => updateSerial({ stopbits: Number(v) })} />
                  <SerialSelect label="Flow control" value={serial.flow_control}
                    options={[
                      { value: "none", label: "None" },
                      { value: "rtscts", label: "RTS/CTS" },
                      { value: "xonxoff", label: "XON/XOFF" },
                      { value: "dsrdtr", label: "DSR/DTR" },
                    ]}
                    onChange={(v) => updateSerial({ flow_control: v as any })} />
                </div>

                {/* ⭐ Status indicator */}
                <div className="flex items-center gap-2 pt-1 text-[11px]">
                  <CircleDot
                    className={cn(
                      "w-3 h-3 shrink-0",
                      serial.status === "open"  ? "text-accent-green" :
                      serial.status === "error" ? "text-accent-red"   :
                                                  "text-tertiary"
                    )}
                  />
                  <span
                    className={cn(
                      "truncate",
                      serial.status === "open"  ? "text-accent-green" :
                      serial.status === "error" ? "text-accent-red"   :
                                                  "text-tertiary"
                    )}
                    title={serial.last_error ?? undefined}
                  >
                    {serial.status === "open"  ? `Connected · ${serial.port}` :
                     serial.status === "error" ? `Error: ${serial.last_error}` :
                                                 "Idle — waiting for backend"}
                  </span>
                </div>

                {serialError && (
                  <div className="text-[11px] text-accent-red bg-accent-red/5 border border-accent-red/20 rounded p-2">
                    {serialError}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ─── Info ────────────────────────────────────── */}
          <section>
            <h3 className="text-[11px] uppercase tracking-widest text-tertiary mb-3">
              About
            </h3>
            <div className="text-[11px] text-tertiary space-y-1.5 leading-relaxed">
              <div className="flex justify-between">
                <span>Application</span>
                <span className="mono text-secondary">WFI-AI-CFI TM Viewer</span>
              </div>
              <div className="flex justify-between">
                <span>Version</span>
                <span className="mono text-secondary">0.1.0</span>
              </div>
              <div className="flex justify-between">
                <span>Storage</span>
                <span className="mono text-secondary">localStorage</span>
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
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-tertiary block mb-1">{label}</span>
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

function SerialField({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-tertiary block mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full mono text-xs"
        spellCheck={false}
      />
    </label>
  );
}

function SerialSelect({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: string[] | { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const opts = options.map((o) =>
    typeof o === "string" ? { value: o, label: o } : o
  );
  return (
    <label className="block">
      <span className="text-[11px] text-tertiary block mb-1">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mono text-xs"
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}