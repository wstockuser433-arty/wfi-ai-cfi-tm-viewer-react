import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useTelemetry } from "@/store/telemetryStore";
import { Card } from "../ui/card";

interface Sample {
  t: number;
  cam_fpa: number;
  ai_soc: number;
  ppc_dcdc: number;
}

// Params we want to plot: (apid, field)
const SERIES = [
  { apid: 0x100, field: "cam_fpa_temp", key: "cam_fpa", label: "Camera FPA Temp", color: "#00E5FF" },
  { apid: 0x111, field: "ai_soc_temp",  key: "ai_soc",  label: "CDPM (P) AI SoC", color: "#22C55E" },
  { apid: 0x131, field: "ppc_dcdc_temp", key: "ppc_dcdc", label: "CTPU (P) DC-DC", color: "#FFB020" },
];

export function LiveChart() {
  const packets = useTelemetry(s => s.packets);
  const [data, setData] = useState<Sample[]>([]);

  useEffect(() => {
    // Group packets by timestamp second, pull the latest value of each field
    const byTime = new Map<number, Partial<Sample>>();
    for (const p of packets) {
      const series = SERIES.find(s => s.apid === p.apid);
      if (!series) continue;
      const field = p.fields[series.field];
      if (!field) continue;
      const bucket = Math.floor(p.timestamp * 2) / 2; // 0.5 s buckets
      const entry = byTime.get(bucket) ?? { t: bucket };
      (entry as any)[series.key] = field.value;
      byTime.set(bucket, entry);
    }
    const next = Array.from(byTime.values())
      .sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
      .slice(-120) as Sample[];
    setData(next);
  }, [packets]);

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">Thermal Trends</h3>
          <p className="text-[11px] text-muted">Rolling window · 0.5 s buckets</p>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          {SERIES.map(s => (
            <span key={s.key} className="flex items-center gap-1.5 text-muted">
              <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="h-[260px]">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="#ffffff08" />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => new Date((v as number) * 1000).toISOString().substring(17, 23)}
              stroke="#8B95A9"
              fontSize={10}
            />
            <YAxis stroke="#8B95A9" fontSize={10} />
            <Tooltip
              contentStyle={{
                background: "#141925",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => new Date((v as number) * 1000).toLocaleTimeString()}
            />
            {SERIES.map(s => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={s.color}
                dot={false}
                isAnimationActive={false}
                strokeWidth={1.75}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}