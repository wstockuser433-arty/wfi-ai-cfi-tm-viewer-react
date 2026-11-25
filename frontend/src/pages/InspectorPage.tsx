import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { UploadDumpButton } from "@/components/inspector/UploadDumpButton";
import { PacketListTable } from "@/components/inspector/PacketListTable";
import { PacketDetailsPanel } from "@/components/inspector/PacketDetailsPanel";
import { useTelemetry } from "@/store/telemetryStore";
import { useUiStore } from "@/store/uiStore";
import { API_BASE } from "@/lib/api";
import type { DecodedPacket } from "@/types/packet";
import { packetId } from "@/types/packet";

export function InspectorPage() {
  const addPackets = useTelemetry((s) => s.addPackets);
  const setSelectedPacketId = useTelemetry((s) => s.setSelectedPacketId);
  const packetFilter = useUiStore((s) => s.packetFilter);
  const setPacketFilter = useUiStore((s) => s.setPacketFilter);

  const [dbPackets, setDbPackets] = useState<DecodedPacket[] | null>(null);
  const [offlinePackets, setOfflinePackets] = useState<DecodedPacket[]>([]);
  const hasFetchedForFilter = useRef<string | null>(null);

  // Fetch list from DB when filter changes
  useEffect(() => {
    if (!packetFilter || !packetFilter.subsystem) {
      hasFetchedForFilter.current = null;
      setDbPackets(null);
      return;
    }

    const filterKey = `${packetFilter.subsystem}-${packetFilter.unit_id}-${packetFilter.unit_sub_id}-${packetFilter.card || 'all'}`;
    if (hasFetchedForFilter.current === filterKey) return;

    async function fetchHistory() {
      try {
        hasFetchedForFilter.current = filterKey;
        const params = new URLSearchParams({
          subsystems: packetFilter!.subsystem!,
          limit: "500",
          order: "desc"
        });
        if (packetFilter!.card) params.set("card", packetFilter!.card);

        const res = await fetch(`${API_BASE}/api/history?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const mapped: DecodedPacket[] = (data.packets ?? []).map((r: any) => ({
          ...r,
          timestamp: Math.round(new Date(r.ts).getTime()) / 1000,
          apid_name: r.card ?? "",
          subsystem: r.subsystem ?? "",
          card: r.card ?? "",
          hw_class: "",
          length: r.raw_hex ? r.raw_hex.length / 2 : 0,
          payload_hex: r.payload_hex ?? "",
          raw_hex: r.raw_hex ?? "",
          fields: r.fields ?? {},
          cc: 0,
        }));

        addPackets(mapped);
        setDbPackets(mapped);
      } catch (e) {
        console.error("Failed to fetch history", e);
        hasFetchedForFilter.current = null;
      }
    }

    fetchHistory();
  }, [packetFilter, addPackets]);

  // Handle JSON Upload
  const handleUpload = (pkts: DecodedPacket[]) => {
    setOfflinePackets(pkts);
    if (pkts.length > 0) {
      const newest = [...pkts].sort((a, b) => b.timestamp - a.timestamp)[0];
      setSelectedPacketId(packetId(newest));
    }
  };

  // ⭐ Determine the exact array passed to the table
  const dataForTable = packetFilter ? (dbPackets || []) : offlinePackets;

  return (
    <div className="flex flex-col h-full space-y-4">
      <Card className="py-2 px-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Packet Inspector</h2>
          <p className="text-xs text-muted">
            {packetFilter 
              ? `Filtered: ${packetFilter.subsystem || "Unknown"}${packetFilter.card ? ` / ${packetFilter.card}` : ""} (from DB)` 
              : "Offline Viewer — Upload a JSON dump."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {packetFilter && (
            <button
              onClick={() => {
                setPacketFilter(null);
                hasFetchedForFilter.current = null;
                setDbPackets(null);
              }}
              className="text-xs text-muted hover:underline mr-2"
            >
              Clear Filter
            </button>
          )}
          <UploadDumpButton onUpload={handleUpload} />
        </div>
      </Card>

      <div className="grid grid-cols-[480px_1fr] gap-4 flex-1 min-h-0">
        <Card className="flex flex-col min-h-0 p-0 overflow-hidden">
          <PacketListTable
            filter={packetFilter}
            overridePackets={dataForTable} // ⭐ Pass the resolved array
          />
        </Card>
        <Card className="flex-1 min-h-0 overflow-auto">
          <PacketDetailsPanel />
        </Card>
      </div>
    </div>
  );
}