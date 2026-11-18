import { useEffect, useMemo, useState } from "react";
import {
  CompactPacketTable,
  type PacketLike,
} from "@/components/packets/CompactPacketTable";
import { SubsystemFilter } from "@/components/packets/SubsystemFilter";
import { useTelemetry } from "@/store/telemetryStore";

export default function PacketsLive() {
  const packets = useTelemetry((s) => s.packets);
  const isHydrating = useTelemetry((s) => s.isHydrating);
  const hasHydrated = useTelemetry((s) => s.hasHydrated);
  const hydrate = useTelemetry((s) => s.hydrateFromHistory);

  const [selected, setSelected] = useState<string[]>([]); // subsystem names

  useEffect(() => {
    if (!hasHydrated) hydrate();
  }, [hasHydrated, hydrate]);

  const filtered = useMemo(() => {
    if (selected.length === 0) return packets;
    return packets.filter((p) => p.subsystem && selected.includes(p.subsystem));
  }, [packets, selected]);

  function openInspect(p: PacketLike) {
    const id = p.id ?? `${p.timestamp ?? 0}`;
    window.open(`/standalone/packet/${id}`, "_blank", "width=1200,height=900");
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <SubsystemFilter selected={selected} onChange={setSelected} />
        <span className="text-xs text-muted">{filtered.length} packets</span>
      </div>
      <CompactPacketTable
        packets={filtered as unknown as PacketLike[]}
        loading={isHydrating}
        onInspect={openInspect}
        emptyMessage="No live packets"
      />
    </div>
  );
}