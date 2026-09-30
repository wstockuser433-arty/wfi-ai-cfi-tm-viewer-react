import { useTelemetry } from "@/store/telemetryStore";
import { Badge } from "../ui/badge";
import { Activity } from "lucide-react";

export function LinkHealthStrip() {
  const meta = useTelemetry(s => s.meta);
  const latest = useTelemetry(s => s.latestByApid);
  if (!meta) return null;

  return (
    <div className="glass p-3">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-3.5 h-3.5 text-accent-cyan" />
        <span className="text-xs font-semibold">RS-422 Link Health</span>
      </div>
      <div className="grid grid-cols-4 xl:grid-cols-7 gap-2">
        {meta.links.map(link => {
          const pkt = latest[link.apid];
          const state = pkt?.fields?.link_state?.value;
          const stateLabel = pkt?.fields?.link_state?.enum?.[String(state)] ?? (pkt ? "—" : "NO DATA");
          const variant = stateLabel === "UP" ? "ok"
                        : stateLabel === "DEGRADED" ? "warn"
                        : stateLabel === "DOWN" ? "crit" : "muted";
          return (
            <div key={link.id} className="rounded-md border border-white/5 bg-space-950/40 p-2">
              <div className="text-[10px] text-muted truncate mb-1">{link.label}</div>
              <Badge variant={variant}>{stateLabel}</Badge>
              {pkt && (
                <div className="mono text-[10px] text-muted mt-1">
                  CRC {pkt.fields.crc_err_count?.value ?? "—"} · {pkt.fields.latency_us?.value ?? "—"} µs
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}