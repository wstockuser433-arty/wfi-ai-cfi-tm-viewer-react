import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { API_BASE } from "@/lib/api";
import { Download, Database, RefreshCw, Loader2, ExternalLink, HardDriveDownload } from "lucide-react";
import { useStorageStore } from "@/store/storageStore";

interface PacketSummary {
  id: number;
  ts: string;
  apid: number;
  subsystem: string;
  card: string;
  crc_ok: boolean;
  raw_hex?: string; // Added for export
}

export function StoragePage() {
  const {
    start, end, busy, packets, msg, totalInWindow,
    setStart, setEnd, setBusy, setPackets, setMsg
  } = useStorageStore();

  async function query() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(
        `${API_BASE}/api/history?start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}&limit=2000`
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setPackets(j.packets ?? [], j.count ?? 0);
      setMsg(`${j.count} packets in window`);
    } catch (e) {
      setMsg(`query failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    const r = await fetch(
      `${API_BASE}/api/history?start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}&limit=50000`
    );
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
    setBusy(true);
    setMsg("Preparing export...");
    try {
      const r = await fetch(
        `${API_BASE}/api/history?start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}&limit=50000`
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      
      const pkts = j.packets ?? [];
      if (pkts.length === 0) {
        setMsg("No packets to export.");
        return;
      }

      // ⭐ Export as a JSON array containing { ts, raw_hex }
      const exportData = pkts.map((p: PacketSummary) => ({
        ts: new Date(p.ts).getTime() / 1000, // Convert ISO string to Unix epoch (seconds)
        raw_hex: p.raw_hex
      }));

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tm-capture-${Date.now()}.json`; // <-- Changed extension
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
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-accent-cyan" />
          <h3 className="text-sm font-semibold">TM Storage Explorer</h3>
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
          <Button onClick={query} disabled={busy} className="flex items-center gap-1.5">
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
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">
              Results <span className="text-muted text-xs">({packets.length} packets shown)</span>
            </div>
            {/* ⭐ UPPER LIMIT WARNING */}
            {totalInWindow > packets.length && (
              <div className="text-xs text-accent-amber">
                Showing first {packets.length} of {totalInWindow.toLocaleString()} packets. 
                (Download .bin will attempt to fetch all).
              </div>
            )}
          </div>
          
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 text-[10px] text-muted uppercase tracking-wider sticky top-0 bg-space-800">
                  <th className="text-left py-2 px-2">Time</th>
                  <th className="text-left py-2 px-2">Unit Sub ID</th>
                  <th className="text-left py-2 px-2">Subsystem</th>
                  <th className="text-left py-2 px-2">Card</th>
                  <th className="text-right py-2 px-2">CRC</th>
                  <th className="text-right py-2 px-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {packets.slice(0, 500).map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                    onClick={() => openStandalone(p.id)}
                  >
                    <td className="mono py-1.5 px-2 text-muted">
                      {new Date(p.ts).toLocaleTimeString()}
                    </td>
                    <td className="mono py-1.5 px-2">
                      0x{p.apid.toString(16).toUpperCase()}
                    </td>
                    <td className="py-1.5 px-2">{p.subsystem}</td>
                    <td className="py-1.5 px-2 text-muted">{p.card}</td>
                    <td className="py-1.5 px-2 text-right">
                      <Badge variant={p.crc_ok ? "ok" : "crit"}>
                        {p.crc_ok ? "OK" : "FAIL"}
                      </Badge>
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openStandalone(p.id);
                        }}
                        className="text-accent hover:underline flex items-center gap-1 justify-end w-full"
                        title="Open in new window"
                      >
                        <ExternalLink className="w-3 h-3" /> Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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