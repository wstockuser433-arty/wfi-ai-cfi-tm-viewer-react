import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { API_BASE } from "@/lib/api";
import { Download, Database, RefreshCw, Loader2 } from "lucide-react";

interface PacketSummary {
  id: number;
  ts: string;
  apid: number;
  subsystem: string;
  card: string;
  crc_ok: boolean;
}

export function StoragePage() {
  const [start, setStart] = useState(() => toLocalInput(new Date(Date.now() - 3600_000)));
  const [end, setEnd] = useState(() => toLocalInput(new Date()));
  const [busy, setBusy] = useState(false);
  const [packets, setPackets] = useState<PacketSummary[]>([]);
  const [msg, setMsg] = useState<string>("");

  async function query() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(
        `${API_BASE}/api/history?start=${new Date(start).toISOString()}&end=${new Date(end).toISOString()}&limit=2000`
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setPackets(j.packets ?? []);
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
        p.ts,
        p.apid,
        p.subsystem,
        p.card,
        p.crc_ok,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    downloadBlob(csv, `tm-export-${Date.now()}.csv`, "text/csv");
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-accent-cyan" />
          <h3 className="text-sm font-semibold">TM Storage Explorer</h3>
        </div>

        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-3 items-end">
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
          <Button onClick={exportCsv} className="flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        </div>

        {msg && <div className="mono text-xs text-muted mt-3">{msg}</div>}
      </Card>

      {packets.length > 0 && (
        <Card>
          <div className="text-sm font-semibold mb-3">
            Results <span className="text-muted text-xs">({packets.length} packets)</span>
          </div>
          <div className="overflow-auto max-h-[500px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 text-[10px] text-muted uppercase tracking-wider">
                  <th className="text-left py-2 px-2">Time</th>
                  <th className="text-left py-2 px-2">APID</th>
                  <th className="text-left py-2 px-2">Subsystem</th>
                  <th className="text-left py-2 px-2">Card</th>
                  <th className="text-right py-2 px-2">CRC</th>
                </tr>
              </thead>
              <tbody>
                {packets.slice(0, 500).map((p) => (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="mono py-1.5 px-2 text-muted">
                      {new Date(p.ts).toLocaleTimeString()}
                    </td>
                    <td className="mono py-1.5 px-2">
                      0x{p.apid.toString(16).toUpperCase()}
                    </td>
                    <td className="py-1.5 px-2">{p.subsystem}</td>
                    <td className="py-1.5 px-2 text-muted">{p.card}</td>
                    <td className="py-1.5 px-2 text-right">
                      <Badge variant={p.crc_ok === true ? "ok" : "crit"}>
                        {p.crc_ok === true ? "OK" : "FAIL"}
                      </Badge>
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