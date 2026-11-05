import { useMemo, useState, useEffect } from "react";
import { useTelemetry } from "@/store/telemetryStore";
import { useFilters } from "@/store/filterStore";
import { useIsDark } from "@/hooks/useIsDark";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { formatHex } from "@/lib/utils";

export function PacketDecoder() {
  const meta = useTelemetry((s) => s.meta);
  const packets = useTelemetry((s) => s.packets);
  const subsystems = useFilters((s) => s.subsystems);
  const isDark = useIsDark();
  const [selectedApid, setSelectedApid] = useState<number | null>(null);
  const [fieldSearch, setFieldSearch] = useState("");

  const availableApids = useMemo(() => {
    if (!meta) return [];
    if (subsystems.size === 0) return meta.apids;
    return meta.apids.filter((a) => subsystems.has(a.subsystem));
  }, [meta, subsystems]);

  useEffect(() => {
    if (availableApids.length === 0) {
      setSelectedApid(null);
      return;
    }
    if (
      selectedApid === null ||
      !availableApids.some((a) => a.apid === selectedApid)
    ) {
      setSelectedApid(availableApids[0].apid);
    }
  }, [availableApids, selectedApid]);

  const latest = useMemo(() => {
    if (selectedApid === null) return null;
    for (let i = packets.length - 1; i >= 0; i--) {
      if (packets[i].apid === selectedApid) return packets[i];
    }
    return null;
  }, [packets, selectedApid]);

  const hexLines = useMemo(() => {
    if (!latest) return [];
    const matches = latest.raw_hex.match(/.{2}/g);
    if (!matches) return [];
    const bytes = new Uint8Array(matches.map((h) => parseInt(h, 16)));
    return formatHex(bytes);
  }, [latest]);

  // ─── Field list, filtered by search ──────────────────────────────
  const fieldEntries = useMemo(() => {
    if (!latest?.fields) return [];
    const entries = Object.entries(latest.fields);
    if (!fieldSearch.trim()) return entries;
    const q = fieldSearch.toLowerCase();
    return entries.filter(([name]) => name.toLowerCase().includes(q));
  }, [latest, fieldSearch]);

  if (!meta) return <Card>Loading meta…</Card>;

function apidLabel(a: { apid: number; subsystem: string; card: string; unit_sub_id?: number; service?: number; subservice?: number }): string {
  const parts: string[] = [];
  if (a.unit_sub_id !== undefined) parts.push(`Sub 0x${a.unit_sub_id.toString(16).toUpperCase()}`);
  if (a.service !== undefined) parts.push(`Svc 0x${a.service.toString(16).toUpperCase()}`);
  if (a.subservice !== undefined) parts.push(`SubSvc 0x${a.subservice.toString(16).toUpperCase()}`);
  parts.push(`${a.subsystem}/${a.card}`);
  return parts.join(" · ");
}

  return (
    <Card className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Packet Decoder</h3>
          {subsystems.size > 0 && (
            <Badge variant="cyan">
              filtered · {subsystems.size} subsystem{subsystems.size > 1 ? "s" : ""}
            </Badge>
          )}
          {latest && (
            <Badge variant="muted">
              {Object.keys(latest.fields ?? {}).length} fields
            </Badge>
          )}
        </div>
        <select
          value={selectedApid ?? ""}
          onChange={(e) => setSelectedApid(Number(e.target.value))}
          className="select-dark max-w-md"
        >
          {availableApids.length === 0 ? (
            <option value="">no cards match filter</option>
          ) : (
            availableApids.map((a) => (
              <option key={a.apid} value={a.apid}>
                {apidLabel(a)}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        {/* ─── Hex dump ────────────────────────────────────────── */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase tracking-widest text-muted">
              Hex dump
            </span>
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
                <div key={i} className="whitespace-pre text-slate-300">
                  {line}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ─── Decoded fields ──────────────────────────────────── */}
        <div className="flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2 gap-2">
            <span className="text-[10px] uppercase tracking-widest text-muted">
              Decoded fields
            </span>
            {latest && (
              <input
                type="text"
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                placeholder="filter…"
                className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-[10px] placeholder:text-muted focus:outline-none focus:border-accent/40 mono w-32"
                spellCheck={false}
              />
            )}
          </div>
          <div className="space-y-1.5 overflow-auto flex-1 pr-1">
            {!latest ? (
              <span className="text-muted text-xs">no data</span>
            ) : (
              <>
                {/* Header rows */}
                <FieldRow
                  label="CC"
                  value={`0x${latest.cc.toString(16).padStart(2, "0")}`}
                />
                <FieldRow
                  label="APID"
                  value={`0x${latest.apid.toString(16).toUpperCase()} (${latest.card})`}
                />
                <FieldRow label="Seq" value={latest.seq.toString()} />
                <FieldRow label="Len" value={latest.length.toString()} />

                {latest.unit_id !== undefined && (
                  <FieldRow
                    label="Unit ID"
                    value={`0x${latest.unit_id.toString(16).toUpperCase()}`}
                  />
                )}
                {latest.unit_sub_id !== undefined && (
                  <FieldRow
                    label="Unit Sub ID"
                    value={`0x${latest.unit_sub_id.toString(16).toUpperCase()}`}
                  />
                )}
                {latest.sub_hdr_label !== undefined && (
                  <FieldRow label="Sub-header" value={latest.sub_hdr_label} />
                )}
                {latest.service_type !== undefined && (
                  <FieldRow
                    label="Service"
                    value={`0x${latest.service_type.toString(16).toUpperCase()}`}
                  />
                )}
                {latest.service_subtype !== undefined && (
                  <FieldRow
                    label="Sub-Service"
                    value={`0x${latest.service_subtype.toString(16).toUpperCase()}`}
                  />
                )}

                <div className="h-px bg-white/5 my-2" />

                {/* ⭐ THE FIELDS LOOP — this was missing before ⭐ */}
                {fieldEntries.length === 0 ? (
                  <span className="text-muted text-xs">
                    {fieldSearch
                      ? "no fields match filter"
                      : "no decoded fields in packet"}
                  </span>
                ) : (
                  fieldEntries.map(([name, f]) => (
                    <FieldRow
                      key={name}
                      label={name}
                      value={formatFieldValue(f)}
                      limits={
                        f.limits[0] != null || f.limits[1] != null
                          ? `${f.limits[0] ?? "—"}–${f.limits[1] ?? "—"}`
                          : undefined
                      }
                      status={f.status as "OK" | "WARN" | "CRIT"}
                    />
                  ))
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Field value formatting (handles nulls, enums, units) ─────────────
function formatFieldValue(f: {
  value: number | string | null | undefined;
  unit: string;
  enum?: Record<string, string> | null;
}): string {
  if (f.value === null || f.value === undefined) return "—";

  if (f.enum && typeof f.value === "number" || typeof f.value === "string") {
    const label = f.enum?.[String(f.value)];
    if (label) return `${f.value} (${label})`;
  }

  const unit = f.unit && f.unit !== "-" ? ` ${f.unit}` : "";
  return `${f.value}${unit}`;
}

function FieldRow({
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
    <div className="flex items-center justify-between text-xs py-1 border-b border-white/5">
      <span className="mono text-muted truncate mr-2" title={label}>
        {label}
      </span>
      <div className="flex items-center gap-2 shrink-0">
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