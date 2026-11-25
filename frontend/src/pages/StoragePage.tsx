// Inside StoragePage.tsx
import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";
import { Download, Database, RefreshCw, Loader2, HardDriveDownload, X } from "lucide-react";
import { useStorageStore } from "@/store/storageStore";
import { useUiStore } from "@/store/uiStore";
import { CompactPacketTable, type PacketLike } from "@/components/packets/CompactPacketTable";
import { SubsystemFilter } from "@/components/packets/SubsystemFilter";

export function StoragePage() {
  const {
    start, end, busy, packets, msg, totalInWindow,
    setStart, setEnd, setBusy, setPackets, setMsg
  } = useStorageStore();

  const packetFilter = useUiStore((s) => s.packetFilter);
  const setPacketFilter = useUiStore((s) => s.setPacketFilter);

  // Local state for the SubsystemFilter UI
  const [selectedSubsystems, setSelectedSubsystems] = useState<string[]>([]);

  // Sync local UI state with global filter on mount/change
  useEffect(() => {
    if (packetFilter?.subsystem) {
      setSelectedSubsystems([packetFilter.subsystem]);
    } else {
      setSelectedSubsystems([]);
    }
  }, [packetFilter]);

  const runQuery = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      const params = new URLSearchParams({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        limit: "2000",
      });
      
      if (selectedSubsystems.length > 0) {
        params.set("subsystems", selectedSubsystems.join(","));
      }
      
      if (packetFilter?.card) {
        params.set("card", packetFilter.card);
      }

      const r = await fetch(`${API_BASE}/api/history?${params.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      
      setPackets(j.packets ?? [], j.count ?? 0);
      
      let msgText = `${j.count} packets in window`;
      if (packetFilter?.card) msgText += ` (Card: ${packetFilter.card})`;
      else if (selectedSubsystems.length > 0) msgText += ` (filtered by subsystem)`;
      setMsg(msgText);
      
    } catch (e) {
      setMsg(`query failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }, [start, end, selectedSubsystems, packetFilter?.card, setBusy, setPackets, setMsg]);

  useEffect(() => {
    runQuery();
  }, [runQuery]);

  const handleSubsystemChange = (subs: string[]) => {
    setSelectedSubsystems(subs);
    if (packetFilter?.card) {
      setPacketFilter(null);
    }
  };

  function openStandalone(packetId: number) {
    window.open(`/standalone/packet/${packetId}`, "_blank", "width=1200,height=900");
  }

  return (
    <div className="space-y-4">
      <Card className="relative z-50">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-accent-cyan" />
          <h3 className="text-sm font-semibold">TM Storage Explorer</h3>
        </div>

        {/* Filter Row */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <SubsystemFilter
            selected={selectedSubsystems}
            onChange={handleSubsystemChange}
          />
          
          {selectedSubsystems.length > 0 && (
            <button
              onClick={() => handleSubsystemChange([])}
              className="text-xs text-muted hover:underline"
            >
              Clear subsystem
            </button>
          )}

          {/* ⭐ Display the specific card filter pill */}
          {packetFilter?.card && (
            <div className="flex items-center gap-1.5 px-2 py-1 bg-accent/10 border border-accent/20 rounded-md text-xs text-accent">
              <span>Card: {packetFilter.card}</span>
              <button 
                onClick={() => setPacketFilter({ ...packetFilter, card: undefined })}
                className="hover:bg-accent/20 rounded p-0.5"
                title="Clear card filter"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 items-end">
          <div>
            <label className="text-[10px] uppercase text-muted block mb-1">From</label>
            <input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 mono text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase text-muted block mb-1">To</label>
            <input
              type="datetime-local"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 mono text-xs"
            />
          </div>
          <Button onClick={runQuery} disabled={busy} className="flex items-center gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Query
          </Button>
          {/* CSV / Export buttons remain the same */}
        </div>

        {msg && <div className="mono text-xs text-muted mt-3">{msg}</div>}
      </Card>

      {packets.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">
              Results <span className="text-muted text-xs">({packets.length} packets shown)</span>
            </div>
            {totalInWindow > packets.length && (
              <div className="text-xs text-accent-amber">
                Showing first {packets.length} of {totalInWindow.toLocaleString()} packets.
              </div>
            )}
          </div>
          
          <CompactPacketTable
            packets={packets as unknown as PacketLike[]}
            onInspect={(p) => p.id != null && openStandalone(p.id)}
            emptyMessage="No packets in window"
            loading={busy}
          />
        </Card>
      )}
    </div>
  );
}