import { useState, useMemo } from "react";
import { useTelemetry } from "@/store/telemetryStore";
import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { Button } from "../ui/button";
import { packetId, type DecodedPacket } from "@/types/packet";
import { formatHex } from "@/lib/utils";
import { Download, Bookmark, GitCompare, ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  overridePacket?: DecodedPacket;   // ⭐ For standalone window or explicit override
  overrideBase?: DecodedPacket;     // ⭐ For diff mode
}

export function PacketDetailsPanel({ overridePacket, overrideBase }: Props) {
  const packets = useTelemetry((s) => s.packets);
  const selectedId = useTelemetry((s) => s.selectedPacketId);
  const diffBaseId = useTelemetry((s) => s.diffBaseId);
  const bookmarks = useTelemetry((s) => s.bookmarks);
  const toggleBookmark = useTelemetry((s) => s.toggleBookmark);

  // ─── Resolve which packets to display ──────────────────────
  let selected = overridePacket;
  if (!selected && selectedId) {
    selected = packets.find((p) => packetId(p) === selectedId);
  }

  let diffBase = overrideBase;
  if (!diffBase && diffBaseId) {
    diffBase = packets.find((p) => packetId(p) === diffBaseId);
  }

  if (!selected) {
    return (
      <Card className="h-full flex items-center justify-center text-sm text-muted">
        Select a packet from the list on the left
      </Card>
    );
  }

  const isBookmarked = bookmarks.includes(packetId(selected));

  // ─── Export handlers ───────────────────────────────────────
  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `packet_${packetId(selected)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportBin = () => {
    const bytes = new Uint8Array(selected.raw_hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `packet_${packetId(selected)}.bin`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      {/* Title bar with actions */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">
            {selected.subsystem} / {selected.card}
          </h3>
          <Badge variant={selected.crc_ok ? "ok" : "crit"}>
            {selected.crc_ok ? "CRC OK" : "CRC FAIL"}
          </Badge>
          {diffBase && <Badge variant="warn">DIFF MODE</Badge>}
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 text-xs py-1 h-7"
            title="Export as JSON"
          >
            <Download className="w-3 h-3" /> JSON
          </Button>
          <Button
            onClick={handleExportBin}
            className="flex items-center gap-1.5 text-xs py-1 h-7"
            title="Export raw bytes as .bin"
          >
            <Download className="w-3 h-3" /> BIN
          </Button>
          <Button
            onClick={() => toggleBookmark(packetId(selected))}
            className={cn(
              "flex items-center gap-1.5 text-xs py-1 h-7",
              isBookmarked && "bg-accent/20 text-accent border-accent/30"
            )}
          >
            <Bookmark className={cn("w-3 h-3", isBookmarked && "fill-accent")} />
            {isBookmarked ? "Saved" : "Save"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-4 pr-1">
        {diffBase ? (
          <DiffView base={diffBase} compare={selected} />
        ) : (
          <SinglePacketView packet={selected} />
        )}
      </div>
    </Card>
  );
}

// ─── Single Packet View ─────────────────────────────────────
function SinglePacketView({ packet }: { packet: DecodedPacket }) {
  const rawBytes = packet.raw_hex.match(/.{2}/g) ?? [];
  const hexLines = formatHex(new Uint8Array(rawBytes.map((h) => parseInt(h, 16))));

  return (
    <>
      <Section title="PRIMARY HEADER">
        <Row label="Version / Type" value={`${packet.cc >> 5} / TM`} />
        <Row label="Secondary header" value={packet.sub_hdr_label?.includes("TM") ? "yes" : "no"} />
        <Row
          label="APID"
          value={`0x${packet.apid.toString(16).toUpperCase().padStart(3, "0")} (${packet.card})`}
        />
        <Row label="Sequence flags" value="3 (unsegmented)" />
        <Row label="Sequence count" value={packet.seq.toString()} />
        <Row label="Data length field" value={packet.length.toString()} />
      </Section>

      <Section title="SECONDARY HEADER">
        <Row label="Sub-header" value={packet.sub_hdr_label ?? "—"} />
        <Row label="Service Type" value={`0x${(packet.service_type ?? 0).toString(16).toUpperCase()}`} />
        <Row label="Sub-Service" value={`0x${(packet.service_subtype ?? 0).toString(16).toUpperCase()}`} />
        <Row label="Unit ID" value={`0x${(packet.unit_id ?? 0).toString(16).toUpperCase()}`} />
        <Row label="Unit Sub ID" value={`0x${(packet.unit_sub_id ?? 0).toString(16).toUpperCase()}`} />
        <Row label="RX time (UTC)" value={new Date(packet.timestamp * 1000).toISOString()} />
      </Section>

      <Section title={`SOURCE DATA (${packet.length} bytes)`}>
        <div className="mono text-[11px] text-slate-300 break-all bg-space-950/60 border border-white/5 rounded p-2">
          {packet.payload_hex}
        </div>
      </Section>

      <Section title="DECODED FIELDS">
        <div className="space-y-1.5">
          {Object.entries(packet.fields).map(([name, f]) => (
            <div key={name} className="flex items-center justify-between text-xs py-1 border-b border-white/5">
              <span className="mono text-muted truncate mr-2">{name}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="mono text-slate-100">
                  {f.value === null || f.value === undefined
                    ? "—"
                    : f.enum && f.enum[String(f.value)]
                    ? `${f.value} (${f.enum[String(f.value)]})`
                    : `${f.value}${f.unit && f.unit !== "-" ? ` ${f.unit}` : ""}`}
                </span>
                <Badge
                  variant={f.status === "OK" ? "ok" : f.status === "WARN" ? "warn" : "crit"}
                >
                  {f.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title={`RAW PACKET (${rawBytes.length} bytes)`}>
        <div className="mono text-[11px] leading-5 bg-space-950/60 border border-white/5 rounded p-2 overflow-auto">
          {hexLines.map((line, i) => (
            <div key={i} className="whitespace-pre text-slate-300">
              {line}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

// ─── Diff View ──────────────────────────────────────────────
function DiffView({ base, compare }: { base: DecodedPacket; compare: DecodedPacket }) {
  const allKeys = Array.from(
    new Set([...Object.keys(base.fields), ...Object.keys(compare.fields)])
  );

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-widest text-tertiary border-b border-white/10 pb-2">
        <div>Field</div>
        <div className="text-center text-accent">Base</div>
        <div className="text-center text-accent">Compare</div>
      </div>

      {allKeys.map((key) => {
        const f1 = base.fields[key];
        const f2 = compare.fields[key];
        const v1 = f1?.value;
        const v2 = f2?.value;
        const isDifferent = v1 !== v2;

        return (
          <div
            key={key}
            className={cn(
              "grid grid-cols-3 gap-2 text-xs py-1 border-b border-white/5",
              isDifferent && "bg-accent/5"
            )}
          >
            <div className="mono text-muted truncate">{key}</div>
            <div className={cn("mono text-center", isDifferent ? "text-accent" : "text-slate-300")}>
              {v1 === undefined ? "—" : v1}
            </div>
            <div className={cn("mono text-center", isDifferent ? "text-accent font-bold" : "text-slate-300")}>
              {v2 === undefined ? "—" : v2}
            </div>
          </div>
        );
      })}
    </div>
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