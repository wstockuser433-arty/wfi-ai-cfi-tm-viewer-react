import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";
import { Download, Database, RefreshCw, Loader2, HardDriveDownload } from "lucide-react";
import { useStorageStore } from "@/store/storageStore";
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

  const [selectedSubsystems, setSelectedSubsystems] = useState<string[]>([]);

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

      const r = await fetch(`${API_BASE}/api/history?${params.toString()}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      
      setPackets(j.packets ?? [], j.count ?? 0);
      
      if (selectedSubsystems.length > 0) {
        setMsg(`${j.count} packets in window (filtered by ${selectedSubsystems.length} subsystem(s))`);
      } else {
        setMsg(`${j.count} packets in window`);
      }
    } catch (e) {
      setMsg(`query failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }, [start, end, selectedSubsystems, setBusy, setPackets, setMsg]);

  // Re-run automatically when the subsystem filter changes
  useEffect(() => {
    runQuery();
  }, [runQuery]);

  async function exportCsv() {
    // ... (keep existing export code) ...
    const params = new URLSearchParams({
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      limit: "50000",
    });
    if (selectedSubsystems.length > 0) params.set("subsystems", selectedSubsystems.join(","));

    const r = await fetch(`${API_BASE}/api/history?${params.toString()}`);
    const j = await r.json();
    const rows = [
      ["ts", "apid", "subsystem", "card", "crc_ok"],
      ...(j.packets ?? []).map((p: PacketSummary) => [
        p.ts, p.apid, p.subsystem, p.card, p.crc_ok,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    downloadBlob(csv, `tm-export-${Date.now()}.csv`, "text/csv");
  }

  async function downloadBin() {
    // ... (keep existing export code) ...
    setBusy(true);
    setMsg("Preparing export...");
    try {
      const params = new URLSearchParams({
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        limit: "50000",
      });
      if (selectedSubsystems.length > 0) params.set("subsystems", selectedSubsystems.join(","));

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
      setBusy(false);
    }
  }

  function openStandalone(packetId: number) {
    window.open(`/standalone/packet/${packetId}`, "_blank", "width=1200,height=900");
  }

  return (
    <div className="space-y-4">
      <Card className="relative z-[100]">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-accent-cyan" />
          <h3 className="text-sm font-semibold">TM Storage Explorer</h3>
        </div>

        <div className="flex items-center gap-2 mb-4 relative z-[100]">
          <SubsystemFilter
            selected={selectedSubsystems}
            onChange={setSelectedSubsystems}
          />
          {selectedSubsystems.length > 0 && (
            <button
              onClick={() => setSelectedSubsystems([])}
              className="text-xs text-muted hover:underline"
            >
              Clear filter
            </button>
          )}
        </div>

        <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-3 items-end">
          {/* ... time inputs, buttons ... */}
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
          <Button onClick={exportCsv} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-slate-200">
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
          <Button onClick={downloadBin} disabled={busy} className="flex items-center gap-1.5 bg-accent/20 hover:bg-accent/30 text-accent">
            <HardDriveDownload className="w-3.5 h-3.5" /> Export .json
          </Button>
        </div>

        {msg && <div className="mono text-xs text-muted mt-3">{msg}</div>}
      </Card>

      {packets.length > 0 && (
        /* ⭐ Ensure table Card has a lower z-index context */
        <Card className="relative z-0">
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
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}