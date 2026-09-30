import { useMemo, useState, useEffect } from "react";
import { useTelemetry } from "@/store/telemetryStore";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { formatHex, cn } from "@/lib/utils";

export function PacketDecoder() {
  const meta = useTelemetry(s => s.meta);
  const packets = useTelemetry(s => s.packets);
  const [selectedApid, setSelectedApid] = useState<number | null>(null);

  // Auto-select first APID once meta is loaded
  useEffect(() => {
    if (meta && selectedApid === null) {
      const first = meta.apids[0]?.apid;
      if (first != null) setSelectedApid(first);
    }
  }, [meta, selectedApid]);

  const latest = useMemo(() => {
    if (selectedApid === null) return null;
    for (let i = packets.length - 1; i >= 0; i--) {
      if (packets[i].apid === selectedApid) return packets[i];
    }
    return null;
  }, [packets, selectedApid]);

  const hexLines = useMemo(() => {
    if (!latest) return [];
    const bytes = new Uint8Array(
      latest.raw_hex.match(/.{2}/g)!.map(h => parseInt(h, 16))
    );
    return formatHex(bytes);
  }, [latest]);

  if (!meta) return <Card>Loading meta…</Card>;

  return (
    <Card className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Packet Decoder</h3>
        <select
          value={selectedApid ?? ""}
          onChange={e => setSelectedApid(Number(e.target.value))}
          className="bg-white/5 border border-white/10 rounded-md text-[11px] mono px-2 py-1 focus:outline-none focus:border-accent-cyan/40"
        >
          {meta.apids.map(a => (
            <option key={a.apid} value={a.apid}>
              0x{a.apid.toString(16).toUpperCase()} · {a.subsystem}/{a.card}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        {/* Hex dump */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-widest text-muted">Hex dump</span>
            {latest && (
              <Badge variant={latest.crc_ok ? "ok" : "crit"}>
                CRC {latest.crc_ok ? "OK" : "FAIL"}
              </Badge>
            )}
          </div>
          <div className="mono text-[11px] leading-5 bg-space-950/60 border border-white/5 rounded p-2 overflow-auto flex-1">
            {hexLines.length === 0 ? (
              <span className="text-muted">waiting for packets…</span>
            ) : (
              hexLines.map((line: string, i: number) => (
                <div key={i} className="whitespace-pre text-slate-300">{line}</div>
              ))
            )}
          </div>
        </div>

        {/* Decoded fields */}
        <div className="flex flex-col min-h-0">
          <span className="text-[10px] uppercase tracking-widest text-muted mb-2">Decoded fields</span>
          <div className="space-y-1.5 overflow-auto flex-1 pr-1">
            {!latest ? (
              <span className="text-muted text-xs">no data</span>
            ) : (
              <>
                <FieldRow label="CC" value={`0x${latest.cc.toString(16).padStart(2, "0")}`} />
                <FieldRow
                  label="APID"
                  value={`0x${latest.apid.toString(16).toUpperCase()} (${latest.card})`}
                />
                <FieldRow label="Seq" value={latest.seq.toString()} />
                <FieldRow label="Len" value={latest.length.toString()} />
                <div className="h-px bg-white/5 my-2" />
                {Object.entries(latest.fields).map(([k, f]) => (
                  <FieldRow
                    key={k}
                    label={k}
                    value={
                      f.enum && f.enum[String(f.value)]
                        ? `${f.value} (${f.enum[String(f.value)]})`
                        : `${f.value} ${f.unit}`
                    }
                    limits={`${f.limits[0] ?? "—"}–${f.limits[1] ?? "—"}`}
                    status={f.status}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function FieldRow({
  label, value, limits, status,
}: {
  label: string;
  value: string;
  limits?: string;
  status?: "OK" | "WARN" | "CRIT";
}) {
  return (
    <div className="flex items-center justify-between text-xs py-1 border-b border-white/5">
      <span className="mono text-muted">{label}</span>
      <div className="flex items-center gap-2">
        {limits && <span className="mono text-[10px] text-muted">{limits}</span>}
        <span className="mono text-slate-100">{value}</span>
        {status && (
          <Badge variant={status === "OK" ? "ok" : status === "WARN" ? "warn" : "crit"}>
            {status}
          </Badge>
        )}
      </div>
    </div>
  );
}