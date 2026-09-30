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
import { Badge } from "../ui/badge";

const MISSION_T0 = Date.now();

export function StatusBar() {
  const link = useTelemetry((s) => s.link);
  const total = useTelemetry((s) => s.totalReceived);
  const lastAt = useTelemetry((s) => s.lastPacketAt);
  const [missionTime, setMissionTime] = useState("T+00:00:00");
  const [stale, setStale] = useState(false);

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

  // Packet-arrival watchdog: if no packet in 3 s, flag as stale
  useEffect(() => {
    const id = window.setInterval(() => {
      const delta = Date.now() - lastAt;
      setStale(lastAt > 0 && delta > 3000);
    }, 500);
    return () => window.clearInterval(id);
  }, [lastAt]);

  const linkCfg = {
    connected: { Icon: Wifi, color: "text-accent-green", label: "LIVE", variant: "ok" as const },
    connecting: { Icon: Loader2, color: "text-accent-amber", label: "CONNECTING", variant: "warn" as const },
    disconnected: { Icon: WifiOff, color: "text-accent-red", label: "OFFLINE", variant: "crit" as const },
  }[link];
  const { Icon } = linkCfg;

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b border-white/5 glass-strong">
      {/* Left: identity */}
      <div className="flex items-center gap-3">
        <Satellite className="w-5 h-5 text-accent-cyan" />
        <div className="flex items-baseline gap-2">
          <span className="font-semibold tracking-wide">WFI-AI-CFI</span>
          <span className="text-xs text-muted uppercase tracking-widest">
            TM Viewer
          </span>
        </div>
      </div>

      {/* Right: status + tools */}
      <div className="flex items-center gap-4">
        {/* Link state */}
        <div className="flex items-center gap-2">
          <span className={`pulse-dot ${linkCfg.color}`} />
          <Icon
            className={`w-4 h-4 ${linkCfg.color} ${
              link === "connecting" ? "animate-spin" : ""
            }`}
          />
          <Badge variant={linkCfg.variant}>{linkCfg.label}</Badge>
        </div>

        {/* Stale warning */}
        {stale && link === "connected" && (
          <Badge variant="warn">NO DATA &gt;3s</Badge>
        )}

        {/* Mission time */}
        <div className="mono text-sm text-accent-cyan">{missionTime}</div>

        {/* Packet count */}
        <div className="mono text-xs text-muted">
          {total.toLocaleString()} pkt
        </div>

        {/* Tools */}
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