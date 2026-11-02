import { useMemo } from "react";
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
import type { DecodedPacket } from "@/lib/api";

interface Props {
  selectedKeys: string[];
}

const PALETTE_DARK = [
  "#00E5FF", "#22C55E", "#FFB020", "#A855F7", "#FF4D5E",
  "#38BDF8", "#F472B6", "#FBBF24", "#34D399", "#818CF8",
];
const PALETTE_LIGHT = [
  "#0284C7", "#15803D", "#B45309", "#7E22CE", "#BE123C",
  "#0369A1", "#BE185D", "#A16207", "#047857", "#4338CA",
];

export function MultiSeriesChart({ selectedKeys }: Props) {
  const packets = useTelemetry((s) => s.packets);
  const isDark = useIsDark();
  const tokens = chartTokens(isDark);
  const palette = isDark ? PALETTE_DARK : PALETTE_LIGHT;

  const { data, series } = useMemo(() => {
    const wanted = new Map<number, { field: string; key: string }>();
    const seriesMeta: { key: string; label: string; color: string }[] = [];
    let idx = 0;

    for (const k of selectedKeys) {
      const [apidStr, field] = k.split(":");
      const apid = Number(apidStr);
      wanted.set(apid, { field, key: field });
      seriesMeta.push({
        key: field,
        label: `${apidStr}:${field}`,
        color: palette[idx++ % palette.length],
      });
    }

    const bucketMap = new Map<number, Record<string, number>>();

    for (const p of packets as DecodedPacket[]) {
      const w = wanted.get(p.apid);
      if (!w) continue;
      const f = p.fields[w.field];
      
      if (!f || f.value === null || f.value === undefined) continue;
      if (typeof f.value !== "number" || Number.isNaN(f.value)) continue;
      
      const bucket = Math.floor(p.timestamp * 2) / 2;
      const entry = bucketMap.get(bucket) ?? { t: bucket };
      entry[w.field] = f.value;
      bucketMap.set(bucket, entry);
    }

    const sorted = Array.from(bucketMap.values())
      .sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
      .slice(-180);

    return { data: sorted, series: seriesMeta };
  }, [packets, selectedKeys, palette]);

  if (selectedKeys.length === 0) {
  return (
    <div className="h-[400px] flex items-center justify-center text-sm text-muted">
      Select parameters above to see trends
    </div>
  );
}

  return (
    <div className="h-[400px]" key={selectedKeys.join(",")}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={tokens.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => {
              const d = new Date((v as number) * 1000);
              return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            }}
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
          {series.map((s) => (
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
  );
}