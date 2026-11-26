import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { API_BASE } from "@/lib/api";
import { Download, Database, RefreshCw, Loader2, HardDriveDownload, X } from "lucide-react";
import { useStorageStore } from "@/store/storageStore";
import { useUiStore } from "@/store/uiStore";
import { CompactPacketTable, type PacketLike } from "@/components/packets/CompactPacketTable";
import { SubsystemFilter } from "@/components/packets/SubsystemFilter";

interface PacketSummary {
  id: number;
  ts: string;
  apid: number;
  subsystem: string;
  card: string;
  crc_ok: boolean;
  raw_hex?: string;
}

export function StoragePage() {
  const {
    start, end, busy, packets, msg, totalInWindow,
    setStart, setEnd, setBusy, setPackets, setMsg
  } = useStorageStore();

  const packetFilter = useUiStore((s) => s.packetFilter);
  const setPacketFilter = useUiStore((s) => s.setPacketFilter);

  const [selectedSubsystems, setSelectedSubsystems] = useState<string[]>([]);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);

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

  const queryKey = `${start}|${end}|${selectedSubsystems.join(",")}|${packetFilter?.card ?? ""}`;
  const prevQueryKey = useRef<string>("");

  useEffect(() => {
    if (prevQueryKey.current !== queryKey) {
      prevQueryKey.current = queryKey;
      runQuery();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const handleSubsystemChange = (subs: string[]) => {
    setSelectedSubsystems(subs);
    if (packetFilter?.card) {
      setPacketFilter(null);
    }
  };

  async function exportCsv() {
    setExportingCsv(true);
    setMsg("Preparing CSV...");
    try {
      const params = new URLSearchParams({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        limit: "50000",
      });
      if (selectedSubsystems.length > 0) params.set("subsystems", selectedSubsystems.join(","));
      if (packetFilter?.card) params.set("card", packetFilter.card);

      const r = await fetch(`${API_BASE}/api/history?${params.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      
      const pkts = j.packets ?? [];
      if (pkts.length === 0) {
        setMsg("No packets to export.");
        return;
      }

      const rows = [
        ["ts", "apid", "subsystem", "card", "crc_ok"],
        ...pkts.map((p: PacketSummary) => [
          p.ts, p.apid, p.subsystem, p.card, p.crc_ok,
        ]),
      ];
      const csv = rows.map((r: any) => r.join(",")).join("\n");
      downloadBlob(csv, `tm-export-${Date.now()}.csv`, "text/csv");
      setMsg(`Exported ${pkts.length} packets to .csv`);
    } catch (e) {
      setMsg(`export failed: ${e}`);
    } finally {
      setExportingCsv(false);
    }
  }

  async function downloadBin() {
    setExportingJson(true);
    setMsg("Preparing export...");
    try {
      const params = new URLSearchParams({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        limit: "50000",
      });
      if (selectedSubsystems.length > 0) params.set("subsystems", selectedSubsystems.join(","));
      if (packetFilter?.card) params.set("card", packetFilter.card);

      const r = await fetch(`${API_BASE}/api/history?${params.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      
      const pkts = j.packets ?? [];
      if (pkts.length === 0) {
        setMsg("No packets to export.");
        return;
      }

      const exportData = pkts.map((p: PacketSummary) => ({
        ts: new Date(p.ts).getTime() / 1000,
        raw_hex: p.raw_hex
      }));

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tm-capture-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      setMsg(`Downloaded ${pkts.length} packets to .json`);
    } catch (e) {
      setMsg(`export failed: ${e}`);
    } finally {
      setExportingJson(false);
    }
  }

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
          
          {/* ⭐ Unified styling — all three buttons now match */}
          <button
            onClick={runQuery}
            disabled={busy}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Query
          </button>
          
          <button
            onClick={exportCsv}
            disabled={exportingCsv}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-colors disabled:opacity-50"
          >
            {exportingCsv ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            CSV
          </button>
          
          <button
            onClick={downloadBin}
            disabled={exportingJson}
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 transition-colors disabled:opacity-50"
          >
            {exportingJson ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <HardDriveDownload className="w-3.5 h-3.5" />
            )}
            Export .json
          </button>
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

function downloadBlob(content: string, name: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = name;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}