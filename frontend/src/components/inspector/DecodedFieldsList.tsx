import type { DecodedPacket } from "@/lib/api";
import { Badge } from "../ui/badge";

interface Props {
  packet: DecodedPacket | null;
}

export function DecodedFieldsList({ packet }: Props) {
  if (!packet) return <div className="text-muted text-xs">no data</div>;

  return (
    <div className="space-y-1.5 text-xs">
      <Row label="CC" value={`0x${packet.cc.toString(16).padStart(2, "0")}`} />
      <Row
        label="APID"
        value={`0x${packet.apid.toString(16).toUpperCase()} (${packet.card})`}
      />
      <Row label="Seq" value={packet.seq.toString()} />
      <Row label="Len" value={packet.length.toString()} />
      <div className="h-px bg-white/5 my-2" />
      {Object.entries(packet.fields).map(([k, f]) => {
        const enumLabel = f.enum?.[String(f.value)];
        const display = enumLabel
          ? `${f.value} (${enumLabel})`
          : `${f.value}${f.unit ? ` ${f.unit}` : ""}`;
        return (
          <Row
            key={k}
            label={k}
            value={display}
            limits={`${f.limits[0] ?? "—"}–${f.limits[1] ?? "—"}`}
            status={f.status}
          />
        );
      })}
    </div>
  );
}

function Row({
  label,
  value,
  limits,
  status,
}: {
  label: string;
  value: string;
  limits?: string;
  status?: "OK" | "WARN" | "CRIT";
}) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-white/5">
      <span className="mono text-muted">{label}</span>
      <div className="flex items-center gap-2">
        {limits && <span className="mono text-[10px] text-muted">{limits}</span>}
        <span className="mono text-slate-100">{value}</span>
        {status && (
          <Badge
            variant={status === "OK" ? "ok" : status === "WARN" ? "warn" : "crit"}
          >
            {status}
          </Badge>
        )}
      </div>
    </div>
  );
}