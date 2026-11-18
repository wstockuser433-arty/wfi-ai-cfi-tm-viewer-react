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
  const packets = useTelemetry((s) => s.packets);
  const addPackets = useTelemetry((s) => s.addPackets);
  const selectedId = useTelemetry((s) => s.selectedPacketId);
  const packetFilter = useUiStore((s) => s.packetFilter);
  const setPacketFilter = useUiStore((s) => s.setPacketFilter);

  const [dbPackets, setDbPackets] = useState<DecodedPacket[] | null>(null);
  const hasFetchedForFilter = useRef<string | null>(null);

  // ─── 1. Fetch list from DB when filter changes ───
  useEffect(() => {
    if (!packetFilter || !packetFilter.subsystem) {
      hasFetchedForFilter.current = null;
      setDbPackets(null);
      return;
    }

    const filterKey = `${packetFilter.subsystem}-${packetFilter.unit_id}-${packetFilter.unit_sub_id}`;
    if (hasFetchedForFilter.current === filterKey) return;

    async function fetchHistory() {
      try {
        hasFetchedForFilter.current = filterKey;
        const res = await fetch(
          `${API_BASE}/api/history?subsystems=${packetFilter!.subsystem}&limit=500&order=desc`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const mapped: DecodedPacket[] = (data.packets ?? []).map((r: any) => ({
          ...r,
          timestamp: new Date(r.ts).getTime() / 1000,
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

  // ─── 2. Fetch full packet details when a DB row is selected ───
  const lastFetchedId = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedId) return;
    
    // Find the currently selected packet in the store
    const current = packets.find((p) => packetId(p) === selectedId);
    if (!current) return;

    // If it's a DB packet (has integer id) and fields are empty, fetch full data
    const isDbPacket = current.id !== undefined && Number.isInteger(current.id);
    const missingFields = !current.fields || Object.keys(current.fields).length === 0;
    const missingPayload = !current.payload_hex || current.payload_hex.length === 0;

    if (isDbPacket && (missingFields || missingPayload)) {
      const fetchKey = String(current.id);
      if (lastFetchedId.current === fetchKey) return; // Prevent loop
      lastFetchedId.current = fetchKey;

      console.log(`Fetching full packet details for DB ID ${current.id}...`);
      fetch(`${API_BASE}/api/packets/${current.id}`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((fullPacket: DecodedPacket) => {
          // Inject the fully decoded packet into the store
          addPackets([fullPacket]);
        })
        .catch((e) => {
          console.error("Failed to fetch full packet details", e);
        });
    }
  }, [selectedId, packets, addPackets]);

  return (
    <div className="flex flex-col h-full space-y-4">
      <Card className="py-2 px-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Packet Inspector</h2>
          <p className="text-xs text-muted">
            {packetFilter 
              ? `Filtered: ${packetFilter.subsystem || "Unknown"}${dbPackets ? " (from DB)" : ""}` 
              : "Click a packet to inspect. Right-click to filter."}
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
          <UploadDumpButton />
        </div>
      </Card>

      <div className="grid grid-cols-[480px_1fr] gap-4 flex-1 min-h-0">
        <Card className="flex flex-col min-h-0 p-0 overflow-hidden">
          <PacketListTable
            filter={dbPackets ? null : packetFilter}
            overridePackets={dbPackets ?? undefined}
          />
        </Card>
        <Card className="flex-1 min-h-0 overflow-auto">
          <PacketDetailsPanel />
        </Card>
      </div>
    </div>
  );
}