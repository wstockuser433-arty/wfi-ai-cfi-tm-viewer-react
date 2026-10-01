import { useEffect, useState } from "react";
import {
  Satellite,        // fallback icon
  Wifi,
  WifiOff,
  Loader2,
  Search,
  Settings,
  User,
} from "lucide-react";
import { useTelemetry } from "@/store/telemetryStore";
import { useUiStore } from "@/store/uiStore";       // for home navigation
import { Badge } from "../ui/badge";

const MISSION_T0 = Date.now();

export function StatusBar() {
  const link = useTelemetry((s) => s.link);
  const total = useTelemetry((s) => s.totalReceived);
  const lastAt = useTelemetry((s) => s.lastPacketAt);
  const setPage = useUiStore((s) => s.setPage);

  const [missionTime, setMissionTime] = useState("T+00:00:00");
  const [stale, setStale] = useState(false);
  const [logoOk, setLogoOk] = useState(true);

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
    <header className="h-14 flex items-center justify-between px-4 border-b border-white/5 glass-strong">
      {/* ─── Left: logo + brand (clickable → dashboard) ──────── */}
      <button
        onClick={() => setPage("dashboard")}
        className="group flex items-center gap-3 rounded-md px-2 py-1 -ml-2
                   transition-colors hover:bg-white/5
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/40"
        aria-label="Go to Live dashboard"
        title="Go to Live dashboard"
      >
        {/* Logo, or a fallback icon if the image is missing */}
        {logoOk ? (
          <img
            src="/logo-132x128.png"
            alt="WFI-AI-CFI"
            className="h-8 w-auto object-contain select-none pointer-events-none
                       transition-transform group-hover:scale-[1.02]"
            onError={() => setLogoOk(false)}
            draggable={false}
          />
        ) : (
          <Satellite className="w-5 h-5 text-accent-cyan" />
        )}

        <div className="flex items-baseline gap-2">
          <span className="font-semibold tracking-wide text-slate-100">
            WFI-AI-CFI
          </span>
          <span className="text-xs text-muted uppercase tracking-widest">
            TM Viewer
          </span>
        </div>
      </button>

      {/* ─── Right: status + tools (unchanged) ──────────────── */}
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

        {stale && link === "connected" && <Badge variant="warn">NO DATA &gt;3s</Badge>}

        <div className="mono text-sm text-accent-cyan">{missionTime}</div>
        <div className="mono text-xs text-muted">{total.toLocaleString()} pkt</div>

        <div className="flex items-center gap-1 pl-4 border-l border-white/5">
          <button className="p-1.5 hover:bg-white/5 rounded" aria-label="Search">
            <Search className="w-4 h-4 text-muted" />
          </button>
          <button className="p-1.5 hover:bg-white/5 rounded" aria-label="Settings">
            <Settings className="w-4 h-4 text-muted" />
          </button>
          <button className="p-1.5 hover:bg-white/5 rounded" aria-label="User">
            <User className="w-4 h-4 text-muted" />
          </button>
        </div>
      </div>
    </header>
  );
}