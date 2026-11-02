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
  pwr_chip: number | null;
  mcu_i: number | null;
  cmd_rx: number | null;
}

const SERIES = [
  { apid: 16, field: "power_conv_chip_temp_c", key: "pwr_chip" as const, label: "Power Conv Chip Temp", color: "#22C55E", colorLight: "#15803D" },
  { apid: 16, field: "mcu_primary_current_a", key: "mcu_i" as const, label: "MCU Primary Current", color: "#FFB020", colorLight: "#B45309" },
  { apid: 16, field: "cmd_rx_count", key: "cmd_rx" as const, label: "Command Rx Count", color: "#8494DA", colorLight: "#4B5FB4" },
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
    const recentPackets = packets.slice(-500);

    for (const p of recentPackets) {
      const matchingSeries = SERIES.filter((s) => Number(s.apid) === Number(p.apid));
      if (matchingSeries.length === 0) continue;
      
      const bucket = Math.floor(p.timestamp * 2) / 2;
      const entry = byTime.get(bucket) ?? { t: bucket };
      
      for (const series of matchingSeries) {
        const field = p.fields[series.field];
        if (!field || field.value === null || field.value === undefined) continue;
        if (typeof field.value !== "number" || Number.isNaN(field.value)) continue;
        (entry as Record<string, number>)[series.key] = field.value;
      }
      
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
  if (data.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center text-sm text-muted">
        Waiting for numeric values from {SERIES.map(s => s.field).join(", ")}…
      </Card>
    );
  }
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
              tickFormatter={(v) => new Date((v as number) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
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