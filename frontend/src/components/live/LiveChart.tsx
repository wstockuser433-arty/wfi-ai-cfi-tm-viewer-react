import { useEffect, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useTelemetry } from "@/store/telemetryStore";
import { useIsDark } from "@/hooks/useIsDark";
import { chartTokens } from "@/lib/theme-tokens";
import { Card } from "../ui/card";

interface Sample {
  t: number;
  cam_fpa: number | null;
  ai_soc: number | null;
  ppc_dcdc: number | null;
}

// Series colors are theme-independent (they're accent hues); only the
// chrome (grid, axes, tooltip) swaps between themes.
const SERIES = [
  { apid: 0x100, field: "cam_fpa_temp",  key: "cam_fpa" as const,
    label: "Camera FPA Temp",
    color: "#8494DA",         // ⭐ dark: periwinkle
    colorLight: "#4B5FB4" },  // ⭐ light: periwinkle
  { apid: 0x111, field: "ai_soc_temp",   key: "ai_soc" as const,
    label: "CDPM (P) AI SoC",
    color: "#22C55E",
    colorLight: "#15803D" },
  { apid: 0x131, field: "ppc_dcdc_temp", key: "ppc_dcdc" as const,
    label: "CTPU (P) DC-DC",
    color: "#FFB020",
    colorLight: "#B45309" },
];

const REBUILD_INTERVAL_MS = 500;

export function LiveChart() {
  const packets = useTelemetry((s) => s.packets);
  const isDark = useIsDark();
  const tokens = chartTokens(isDark);

  const [data, setData] = useState<Sample[]>([]);
  const lastBuildRef = useRef<number>(0);

  useEffect(() => {
    const now = Date.now();
    if (now - lastBuildRef.current < REBUILD_INTERVAL_MS) return;
    lastBuildRef.current = now;

    const byTime = new Map<number, Partial<Sample>>();
    for (const p of packets) {
      const series = SERIES.find((s) => s.apid === p.apid);
      if (!series) continue;
      const field = p.fields[series.field];
      if (!field || typeof field.value !== "number") continue;
      const bucket = Math.floor(p.timestamp * 2) / 2;
      const entry = byTime.get(bucket) ?? { t: bucket };
      (entry as Record<string, number>)[series.key] = field.value;
      byTime.set(bucket, entry);
    }

    const next = Array.from(byTime.values())
      .sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
      .slice(-120) as Sample[];

    setData((prev) => {
      if (prev.length === next.length && prev.length > 0) {
        const prevLast = prev[prev.length - 1]?.t;
        const nextLast = next[next.length - 1]?.t;
        if (prevLast === nextLast) return prev;
      }
      return next;
    });
  }, [packets]);

  return (
    <Card className="h-full">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">Thermal Trends</h3>
          <p className="text-[11px] text-muted">Rolling window · 0.5 s buckets</p>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5 text-muted">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: isDark ? s.color : s.colorLight }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%" debounce={200}>
          <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: -20 }}>
            <CartesianGrid stroke={tokens.grid} strokeDasharray="3 3" />
            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(v) => new Date((v as number) * 1000).toISOString().substring(17, 23)}
              stroke={tokens.axis}
              fontSize={10}
            />
            <YAxis stroke={tokens.axis} fontSize={10} />
            <Tooltip
              contentStyle={{
                background: tokens.tooltipBg,
                border: `1px solid ${tokens.tooltipBorder}`,
                borderRadius: 8,
                fontSize: 12,
                color: tokens.tooltipText,
              }}
              labelStyle={{ color: tokens.tooltipText }}
              itemStyle={{ color: tokens.tooltipText }}
              labelFormatter={(v) => new Date((v as number) * 1000).toLocaleTimeString()}
              isAnimationActive={false}
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                stroke={isDark ? s.color : s.colorLight}
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