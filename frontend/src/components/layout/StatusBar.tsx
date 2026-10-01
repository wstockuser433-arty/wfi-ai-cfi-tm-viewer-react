import { useEffect, useState } from "react";
import {
  Satellite,
  Wifi,
  WifiOff,
  Loader2,
  Search,
  Settings,
  User,
} from "lucide-react";
import { useTelemetry } from "@/store/telemetryStore";
import { useUiStore } from "@/store/uiStore";
import { Badge } from "../ui/badge";
import { SettingsDrawer } from "../settings/SettingsDrawer";

const MISSION_T0 = Date.now();

export function StatusBar() {
  const link = useTelemetry((s) => s.link);
  const total = useTelemetry((s) => s.totalReceived);
  const lastAt = useTelemetry((s) => s.lastPacketAt);
  const setPage = useUiStore((s) => s.setPage);

  const [missionTime, setMissionTime] = useState("T+00:00:00");
  const [stale, setStale] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Mission clock
  useEffect(() => {
    const id = window.setInterval(() => {
      const s = Math.floor((Date.now() - MISSION_T0) / 1000);
      const hh = String(Math.floor(s / 3600)).padStart(2, "0");
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
      const ss = String(s % 60).padStart(2, "0");
      setMissionTime(`T+${hh}:${mm}:${ss}`);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Stale watchdog
  useEffect(() => {
    const id = window.setInterval(() => {
      const delta = Date.now() - lastAt;
      setStale(lastAt > 0 && delta > 3000);
    }, 500);
    return () => window.clearInterval(id);
  }, [lastAt]);

  const linkCfg = {
    connected:    { Icon: Wifi,    color: "text-accent-green", label: "LIVE",       variant: "ok"   as const },
    connecting:   { Icon: Loader2, color: "text-accent-amber", label: "CONNECTING", variant: "warn" as const },
    disconnected: { Icon: WifiOff, color: "text-accent-red",   label: "OFFLINE",    variant: "crit" as const },
  }[link];
  const { Icon } = linkCfg;

  return (
    <>
      <header className="h-14 flex items-center justify-between px-4 border-b border-white/5 glass-strong">
        {/* ═══ LEFT: Logo + brand ═════════════════════════════════ */}
        <button
          type="button"
          onClick={() => setPage("dashboard")}
          className="group flex items-center gap-3 rounded-md px-2 py-1 -ml-2
                    transition-colors hover-surface
                    focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          aria-label="Go to Live dashboard"
        >
          {logoOk ? (
            <img
              src="/logo.png"
              alt=""
              className="h-8 w-auto max-w-[160px] object-contain select-none pointer-events-none
                        transition-transform group-hover:scale-[1.02]"
              onError={() => setLogoOk(false)}
              draggable={false}
            />
          ) : (
            <Satellite className="w-5 h-5 text-accent" />
          )}

          <div className="flex items-baseline gap-2">
            <span className="font-semibold tracking-wide text-primary">
              WFI-AI-CFI
            </span>
            <span className="text-xs text-tertiary uppercase tracking-widest">
              TM Viewer
            </span>
          </div>
        </button>

        {/* ═══ RIGHT: Status + tools ═══════════════════════════ */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className={`pulse-dot ${linkCfg.color}`} />
            <Icon
              className={`w-4 h-4 ${linkCfg.color} ${
                link === "connecting" ? "animate-spin" : ""
              }`}
            />
            <Badge variant={linkCfg.variant}>{linkCfg.label}</Badge>
          </div>

          {stale && link === "connected" && (
            <Badge variant="warn">NO DATA &gt;3s</Badge>
          )}

          <div className="mono text-sm text-accent">{missionTime}</div>
          <div className="mono text-xs text-muted">
            {total.toLocaleString()} pkt
          </div>

          <div className="flex items-center gap-1 pl-4 border-l border-white/5">
            <button
              className="p-1.5 hover-surface rounded"
              aria-label="Search"
            >
              <Search className="w-4 h-4 text-tertiary" />
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="p-1.5 hover-surface rounded"
              aria-label="Open settings"
            >
              <Settings className="w-4 h-4 text-tertiary" />
            </button>
            <button
              className="p-1.5 hover-surface rounded"
              aria-label="User"
            >
              <User className="w-4 h-4 text-tertiary" />
            </button>
          </div>
        </div>
      </header>

      {/* Drawer lives outside <header> so it overlays content */}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </>
  );
}