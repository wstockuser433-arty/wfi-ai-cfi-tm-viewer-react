import { useState, useMemo, useRef, useEffect } from "react";
import { useTelemetry } from "@/store/telemetryStore";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { ChevronLeft, ChevronRight, Search, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { packetId, type DecodedPacket } from "@/types/packet";

export function PacketListTable() {
  const packets = useTelemetry((s) => s.packets);
  const selectedId = useTelemetry((s) => s.selectedPacketId);
  const setSelectedId = useTelemetry((s) => s.setSelectedPacketId);
  const bookmarks = useTelemetry((s) => s.bookmarks);
  const diffBaseId = useTelemetry((s) => s.diffBaseId);
  const setDiffBaseId = useTelemetry((s) => s.setDiffBaseId);

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    pkt: DecodedPacket;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, []);

  const filteredPackets = useMemo(() => {
    let sorted = [...packets].reverse();
    if (search) {
      const q = search.toLowerCase();
      sorted = sorted.filter(
        (p) =>
          p.apid.toString(16).toLowerCase().includes(q) ||
          p.subsystem.toLowerCase().includes(q) ||
          p.card.toLowerCase().includes(q) ||
          `0x${p.apid.toString(16)}`.includes(q)
      );
    }
    return sorted;
  }, [packets, search]);

  const totalPages = Math.ceil(filteredPackets.length / pageSize) || 1;
  const currentBatch = filteredPackets.slice(
    page * pageSize,
    (page + 1) * pageSize
  );

  const handleContextMenu = (e: React.MouseEvent, pkt: DecodedPacket) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, pkt });
  };

  const handleRowClick = (id: string) => {
    if (diffBaseId === "PENDING") {
      setDiffBaseId(id);
    } else if (diffBaseId && diffBaseId !== id) {
      setSelectedId(id);
    } else {
      setSelectedId(id);
    }
  };

  if (packets.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center text-sm text-muted">
        Waiting for packets…
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col relative" ref={containerRef}>
      {/* ⭐ Adjust top bar layout for more search space */}
      <div className="flex items-center justify-between mb-3 shrink-0 gap-2">
        <h3 className="text-sm font-semibold whitespace-nowrap">Recent</h3>

        {/* Search bar gets flex-1 and a bigger width */}
        <div className="flex-1 min-w-[150px] relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted z-10" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            // ⭐ THE FIX: Only show placeholder when search is empty
            placeholder={search === "" ? "Filter APID, subsystem…" : ""}
            className="w-full bg-white/5 border border-white/10 rounded-md pl-8 pr-2 py-1 text-xs text-slate-100 placeholder:text-muted/50 focus:outline-none focus:border-accent/40"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-tertiary shrink-0">
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            className="bg-white/5 border border-white/10 rounded px-1 py-0.5"
          >
            <option value={25}>25</option>
            <option value={40}>40</option>
          </select>
          <span className="whitespace-nowrap">
            {page + 1} / {totalPages}
          </span>
          <div className="flex gap-0.5">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="p-1 hover:bg-white/10 rounded disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto border border-white/5 rounded-md">
        <table className="w-full text-xs text-left relative">
          <thead className="bg-space-800 text-tertiary uppercase tracking-wider text-[10px] sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="px-2 py-2 font-medium w-6"></th>
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
              const isBaseline = id === diffBaseId;
              const isBookmarked = bookmarks.includes(id);

              return (
                <tr
                  key={`${id}-${i}`}
                  onClick={() => handleRowClick(id)}
                  onContextMenu={(e) => handleContextMenu(e, p)}
                  className={cn(
                    "border-b border-white/5 cursor-pointer transition-colors",
                    isBaseline && "bg-accent-amber/10 border-l-2 border-l-accent-amber",
                    isSelected && !isBaseline && "bg-accent/10 border-l-2 border-l-accent",
                    !isSelected && !isBaseline && "hover:bg-white/5"
                  )}
                >
                  <td className="px-2 py-1.5">
                    {isBookmarked && (
                      <Bookmark className="w-3.5 h-3.5 text-accent fill-accent" />
                    )}
                  </td>
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

      {contextMenu && (
        <div
          className="fixed z-50 bg-space-800 border border-white/10 rounded-md shadow-xl py-1 text-xs text-slate-200 w-48"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-white/10"
            onClick={() => {
              setSearch(`0x${contextMenu.pkt.apid.toString(16).toUpperCase()}`);
              setPage(0);
            }}
          >
            Filter by this APID
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-white/10"
            onClick={() => {
              setSearch(contextMenu.pkt.card);
              setPage(0);
            }}
          >
            Filter by this Card
          </button>
        </div>
      )}
    </Card>
  );
}