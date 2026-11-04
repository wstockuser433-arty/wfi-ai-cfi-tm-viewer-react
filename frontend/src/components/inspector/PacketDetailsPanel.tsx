import { useTelemetry } from "@/store/telemetryStore";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { packetId } from "@/types/packet";
import { formatHex } from "@/lib/utils";

export function PacketDetailsPanel() {
  const packets = useTelemetry((s) => s.packets);
  const selectedId = useTelemetry((s) => s.selectedPacketId);

  const selected = selectedId
    ? packets.find((p) => packetId(p) === selectedId)
    : packets[packets.length - 1];

  if (!selected) {
    return (
      <Card className="h-full flex items-center justify-center text-sm text-muted">
        Select a packet from the list on the left
      </Card>
    );
  }

  // Decompose raw_hex into bytes for the raw packet dump
  const rawBytes = selected.raw_hex.match(/.{2}/g) ?? [];
  const hexLines = formatHex(new Uint8Array(rawBytes.map((h) => parseInt(h, 16))));

  // Extract timestamp as ISO for the Time field
  const rxTime = new Date(selected.timestamp * 1000);

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-sm font-semibold">
          {selected.subsystem} / {selected.card}
        </h3>
        <Badge variant={selected.crc_ok ? "ok" : "crit"}>
          {selected.crc_ok ? "CRC OK" : "CRC FAIL"}
        </Badge>
      </div>

      <div className="flex-1 overflow-auto space-y-4 pr-1">
        {/* ─── PRIMARY HEADER ─────────────────────────────── */}
        <Section title="PRIMARY HEADER">
          <Row label="Version / Type" value={`${selected.cc >> 5} / TM`} />
          <Row
            label="Secondary header"
            value={selected.sub_hdr_label === "FAST_TM" || selected.sub_hdr_label === "SLOW_TM" ? "yes" : "no"}
          />
          <Row
            label="APID"
            value={`0x${selected.apid.toString(16).toUpperCase().padStart(3, "0")} (${selected.card})`}
          />
          <Row label="Sequence flags" value="3 (unsegmented)" />
          <Row label="Sequence count" value={selected.seq.toString()} />
          <Row label="Data length field" value={selected.length.toString()} />
        </Section>

        {/* ─── SECONDARY HEADER ───────────────────────────── */}
        <Section title="SECONDARY HEADER">
          <Row label="Sub-header" value={selected.sub_hdr_label ?? "—"} />
          <Row label="Service Type" value={`0x${(selected.service_type ?? 0).toString(16).toUpperCase()}`} />
          <Row label="Sub-Service" value={`0x${(selected.service_subtype ?? 0).toString(16).toUpperCase()}`} />
          <Row label="Unit ID" value={`0x${(selected.unit_id ?? 0).toString(16).toUpperCase()}`} />
          <Row label="Unit Sub ID" value={`0x${(selected.unit_sub_id ?? 0).toString(16).toUpperCase()}`} />
          <Row label="RX time (UTC)" value={rxTime.toISOString()} />
        </Section>

        {/* ─── SOURCE DATA (payload only) ─────────────────── */}
        <Section title={`SOURCE DATA (${selected.length} bytes)`}>
          <div className="mono text-[11px] text-slate-300 break-all bg-space-950/60 border border-white/5 rounded p-2">
            {selected.payload_hex}
          </div>
        </Section>

        {/* ─── PACKET ERROR CONTROL ───────────────────────── */}
        <Section title="PACKET ERROR CONTROL">
          <Row label="CRC rx / calc" value={selected.crc_ok ? "matches" : "mismatch"} />
          <Row label="Result" value={selected.crc_ok ? "OK" : "FAIL"} />
        </Section>

        {/* ─── DECODED FIELDS ─────────────────────────────── */}
        <Section title={`DECODED FIELDS (${Object.keys(selected.fields).length})`}>
          <div className="space-y-1.5">
            {Object.entries(selected.fields).map(([name, f]) => (
              <FieldRow key={name} name={name} field={f} />
            ))}
          </div>
        </Section>

        {/* ─── RAW PACKET DUMP ────────────────────────────── */}
        <Section title={`RAW PACKET (${rawBytes.length} bytes)`}>
          <div className="mono text-[11px] leading-5 bg-space-950/60 border border-white/5 rounded p-2 overflow-auto">
            {hexLines.map((line, i) => (
              <div key={i} className="whitespace-pre text-slate-300">{line}</div>
            ))}
          </div>
        </Section>
      </div>
    </Card>
  );
}

// ─── Local components ────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-accent mb-1.5 font-semibold">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs py-0.5 border-b border-white/5">
      <span className="text-muted">{label}</span>
      <span className="mono text-slate-100">{value}</span>
    </div>
  );
}

function FieldRow({
  name,
  field,
}: {
  name: string;
  field: {
    value: number | string | null | undefined;
    unit: string;
    status: string;
    enum?: Record<string, string> | null;
    limits: [number | null, number | null];
  };
}) {
  const display =
    field.value === null || field.value === undefined
      ? "—"
      : field.enum && field.enum[String(field.value)]
        ? `${field.value} (${field.enum[String(field.value)]})`
        : `${field.value}${field.unit && field.unit !== "-" ? ` ${field.unit}` : ""}`;

  return (
    <div className="flex items-center justify-between text-xs py-1 border-b border-white/5">
      <span className="mono text-muted truncate mr-2">{name}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="mono text-slate-100">{display}</span>
        <Badge
          variant={
            field.status === "OK" ? "ok" : field.status === "WARN" ? "warn" : "crit"
          }
        >
          {field.status}
        </Badge>
      </div>
    </div>
  );
}