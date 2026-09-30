import { useMemo } from "react";
import { useTelemetry } from "@/store/telemetryStore";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";

interface Row {
  key: string;
  subsystem: string;
  card: string;
  param: string;
  value: number | string;
  unit: string;
  status: "OK" | "WARN" | "CRIT";
  count: number;
}

export function TrendSparkTable() {
  const packets = useTelemetry((s) => s.packets);

  const rows = useMemo(() => {
    const seen = new Map<string, Row>();
    for (const p of packets) {
      for (const [name, f] of Object.entries(p.fields)) {
        if (typeof f.value !== "number") continue;
        const key = `${p.apid}:${name}`;
        const existing = seen.get(key);
        if (existing) {
          existing.count += 1;
          existing.value = f.value;
          existing.status = f.status;
        } else {
          seen.set(key, {
            key,
            subsystem: p.subsystem,
            card: p.card,
            param: name,
            value: f.value,
            unit: f.unit,
            status: f.status,
            count: 1,
          });
        }
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [packets]);

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Parameter Snapshot</h3>
        <span className="text-[11px] text-muted">{rows.length} params</span>
      </div>
      <div className="overflow-auto max-h-[400px]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/5 text-[10px] text-muted uppercase tracking-wider">
              <th className="text-left py-2 px-2">Param</th>
              <th className="text-left py-2 px-2">Subsystem</th>
              <th className="text-left py-2 px-2">Card</th>
              <th className="text-right py-2 px-2">Value</th>
              <th className="text-right py-2 px-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                className="border-b border-white/5 hover:bg-white/5"
              >
                <td className="mono py-1.5 px-2">{r.param}</td>
                <td className="py-1.5 px-2 text-muted">{r.subsystem}</td>
                <td className="py-1.5 px-2 text-muted">{r.card}</td>
                <td className="mono py-1.5 px-2 text-right">
                  {typeof r.value === "number"
                    ? `${r.value.toFixed(3)} ${r.unit}`
                    : `${r.value} ${r.unit}`}
                </td>
                <td className="py-1.5 px-2 text-right">
                  <Badge
                    variant={
                      r.status === "OK" ? "ok" : r.status === "WARN" ? "warn" : "crit"
                    }
                  >
                    {r.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}