import { AlertTriangle, XCircle, BellOff } from "lucide-react";
import { useTelemetry } from "@/store/telemetryStore";
import { Card } from "../ui/card";
import { Button } from "../ui/button";

export function AlarmRail() {
  const alarms = useTelemetry((s) => s.alarms);
  const clear = useTelemetry((s) => s.clearAlarms);

  // Newest first, cap at 20 for render performance
  const recent = [...alarms].reverse().slice(0, 20);

  return (
    <Card className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Alarms</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-muted mono">
            {alarms.length}
          </span>
        </div>
        {alarms.length > 0 && (
          <Button className="text-[11px] px-2 py-1" onClick={clear}>
            Clear
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto -mr-2 pr-2 space-y-2">
        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted text-xs gap-2 py-8">
            <BellOff className="w-6 h-6 opacity-50" />
            <span>No active alarms</span>
          </div>
        ) : (
          recent.map((a) => {
            const isCrit = a.severity === "CRIT";
            const Icon = isCrit ? XCircle : AlertTriangle;
            return (
              <div
                key={`${a.id}-${a.ts}`}
                className={`p-2.5 rounded-md border text-xs ${
                  isCrit
                    ? "bg-accent-red/5 border-accent-red/25"
                    : "bg-accent-amber/5 border-accent-amber/25"
                }`}
              >
                <div className="flex items-start gap-2">
                  <Icon
                    className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                      isCrit ? "text-accent-red" : "text-accent-amber"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`font-medium ${
                          isCrit ? "text-accent-red" : "text-accent-amber"
                        }`}
                      >
                        {a.severity}
                      </span>
                      <span className="mono text-[10px] text-muted">
                        {new Date(a.ts * 1000).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="mono text-[11px] text-slate-300 mt-1 break-words">
                      {a.message}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}