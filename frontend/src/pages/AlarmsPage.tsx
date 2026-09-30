import { AlertTriangle, XCircle, BellOff } from "lucide-react";
import { useAlarms } from "@/hooks/useAlarms";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function AlarmsPage() {
  const { alarms, clear, stats } = useAlarms();
  const recent = [...alarms].reverse();

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <div className="text-xs uppercase tracking-widest text-muted">Total</div>
          <div className="mono text-3xl font-semibold mt-1">{stats.total}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-widest text-accent-amber">WARN</div>
          <div className="mono text-3xl font-semibold mt-1 text-accent-amber">
            {stats.warn}
          </div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-widest text-accent-red">CRIT</div>
          <div className="mono text-3xl font-semibold mt-1 text-accent-red">
            {stats.crit}
          </div>
        </Card>
      </div>

      <Card className="min-h-[400px]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Alarm Log</h3>
          {alarms.length > 0 && (
            <Button className="text-[11px] px-2 py-1" onClick={clear}>
              Clear all
            </Button>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted text-sm gap-2">
            <BellOff className="w-8 h-8 opacity-50" />
            No alarms recorded
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((a) => {
              const isCrit = a.severity === "CRIT";
              const Icon = isCrit ? XCircle : AlertTriangle;
              return (
                <div
                  key={`${a.id}-${a.ts}`}
                  className={`p-3 rounded-md border flex items-start gap-3 ${
                    isCrit
                      ? "bg-accent-red/5 border-accent-red/25"
                      : "bg-accent-amber/5 border-accent-amber/25"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      isCrit ? "text-accent-red" : "text-accent-amber"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge variant={isCrit ? "crit" : "warn"}>{a.severity}</Badge>
                      <span className="mono text-xs text-muted">
                        {a.subsystem} / {a.card}
                      </span>
                      <span className="mono text-[11px] text-muted ml-auto">
                        {new Date(a.ts * 1000).toLocaleString()}
                      </span>
                    </div>
                    <div className="mono text-sm text-slate-200 mt-2">
                      {a.message}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}