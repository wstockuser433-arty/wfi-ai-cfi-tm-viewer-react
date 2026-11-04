import { useState, useMemo } from "react";
import { useTelemetry } from "@/store/telemetryStore";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { packetId } from "@/types/packet";

export function PacketListTable() {
  const packets = useTelemetry((s) => s.packets);
  const selectedId = useTelemetry((s) => s.selectedPacketId);
  const setSelectedId = useTelemetry((s) => s.setSelectedPacketId);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const sortedPackets = useMemo(() => [...packets].reverse(), [packets]);
  const totalPages = Math.ceil(sortedPackets.length / pageSize) || 1;
  const start = page * pageSize;
  const currentBatch = sortedPackets.slice(start, start + pageSize);

  if (packets.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center text-sm text-muted">
        Waiting for packets…
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-sm font-semibold">Recent Packets</h3>
        <div className="flex items-center gap-4 text-xs text-tertiary">
          <div className="flex items-center gap-2">
            <span>Show:</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              className="bg-white/5 border border-white/10 rounded px-1 py-0.5"
            >
              <option value={25}>25</option>
              <option value={40}>40</option>
            </select>
          </div>
          <span>Page {page + 1} of {totalPages}</span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto border border-white/5 rounded-md">
        <table className="w-full text-xs text-left relative">
          <thead className="bg-space-800 text-tertiary uppercase tracking-wider text-[10px] sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">APID</th>
              <th className="px-3 py-2 font-medium">Subsystem / Card</th>
              <th className="px-3 py-2 font-medium text-right">CRC</th>
            </tr>
          </thead>
          <tbody>
            {currentBatch.map((p, i) => {
              const id = packetId(p);
              const isSelected = id === selectedId;
              return (
                <tr
                  key={`${id}-${i}`}
                  onClick={() => setSelectedId(id)}
                  className={cn(
                    "border-b border-white/5 cursor-pointer transition-colors",
                    isSelected
                      ? "bg-accent/10 border-l-2 border-l-accent"
                      : "hover:bg-white/5"
                  )}
                >
                  <td className="px-3 py-1.5 mono text-secondary">
                    {new Date(p.timestamp * 1000).toLocaleTimeString()}
                  </td>
                  <td className="px-3 py-1.5 mono text-primary">
                    0x{p.apid.toString(16).toUpperCase()}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="text-muted">{p.subsystem}</span> /{" "}
                    <span className="text-slate-200">{p.card}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Badge variant={p.crc_ok ? "ok" : "crit"}>
                      {p.crc_ok ? "OK" : "FAIL"}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}