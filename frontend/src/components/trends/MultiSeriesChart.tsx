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
  selectedKeys: string[]; // ["0x100:cam_fpa_temp", ...]
}

const PALETTE_DARK = [
  "#8494DA", "#22C55E", "#FFB020", "#A855F7", "#FF4D5E",
  "#38BDF8", "#F472B6", "#FBBF24", "#34D399", "#818CF8",
];

const PALETTE_LIGHT = [
  "#4B5FB4", "#15803D", "#B45309", "#7E22CE", "#BE123C",
  "#0369A1", "#BE185D", "#A16207", "#047857", "#4338CA",
];

export function MultiSeriesChart({ selectedKeys }: Props) {
  const packets = useTelemetry((s) => s.packets);
  const isDark = useIsDark();
  const tokens = chartTokens(isDark);
  const palette = isDark ? PALETTE_DARK : PALETTE_LIGHT;

  const { data, series } = useMemo(() => {
    const wanted = new Map<number, { field: string; key: string }>();
    for (const k of selectedKeys) {
      const [apidHex, field] = k.split(":");
      wanted.set(parseInt(apidHex, 16), { field, key: field });
    }

    const bucketMap = new Map<number, Record<string, number>>();
    const seriesMeta: { key: string; label: string; color: string }[] = [];
    let idx = 0;

    for (const k of selectedKeys) {
      const [apidHex, field] = k.split(":");
      seriesMeta.push({
        key: field,
        label: `${apidHex}.${field}`,
        color: palette[idx++ % palette.length],
      });
    }

    for (const p of packets as DecodedPacket[]) {
      const w = wanted.get(p.apid);
      if (!w) continue;
      const f = p.fields[w.field];
      if (!f || typeof f.value !== "number") continue;
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

  return (
    <div className="h-[400px]">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={tokens.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) =>
              new Date((v as number) * 1000).toISOString().substring(17, 23)
            }
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
            labelFormatter={(v) =>
              new Date((v as number) * 1000).toLocaleTimeString()
            }
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
              name={s.label}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}