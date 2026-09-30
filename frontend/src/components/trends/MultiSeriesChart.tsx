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
import type { DecodedPacket } from "@/lib/api";

interface Props {
  selectedKeys: string[]; // ["0x100:cam_fpa_temp", ...]
}

const PALETTE = [
  "#00E5FF", "#22C55E", "#FFB020", "#A855F7", "#FF4D5E",
  "#38BDF8", "#F472B6", "#FBBF24", "#34D399", "#818CF8",
];

export function MultiSeriesChart({ selectedKeys }: Props) {
  const packets = useTelemetry((s) => s.packets);

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
        color: PALETTE[idx++ % PALETTE.length],
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
  }, [packets, selectedKeys]);

  return (
    <div className="h-[400px]">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#ffffff08" />
          <XAxis
            dataKey="t"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) =>
              new Date((v as number) * 1000).toISOString().substring(17, 23)
            }
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