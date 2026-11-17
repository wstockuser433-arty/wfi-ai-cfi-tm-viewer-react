import {
  Radio, TrendingUp, Database, Bell, Settings2, Boxes,
  ChevronLeft, ChevronRight, ChevronDown, Bookmark, X, ExternalLink
} from "lucide-react";
import { useTelemetry } from "@/store/telemetryStore";
import { useFilters } from "@/store/filterStore";
import { useUiStore, type Page } from "@/store/uiStore";
import { SUBSYSTEM_COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { packetId, type DecodedPacket } from "@/types/packet";
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

interface NavItem {
  id: Page;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function Sidebar() {
  const meta = useTelemetry((s) => s.meta);
  const alarms = useTelemetry((s) => s.alarms);
  const packets = useTelemetry((s) => s.packets);
  const bookmarks = useTelemetry((s) => s.bookmarks);
  const toggleBookmark = useTelemetry((s) => s.toggleBookmark);
  const sidebarOpen = useTelemetry((s) => s.sidebarOpen);
  const toggleSidebar = useTelemetry((s) => s.toggleSidebar);
  const addPackets = useTelemetry((s) => s.addPackets);

  const activePage = useUiStore((s) => s.activePage);
  const setPage = useUiStore((s) => s.setPage);
  const setPacketFilter = useUiStore((s) => s.setPacketFilter); // ⭐ new action

  // ⭐ State to track which subsystems are expanded
  const [expandedSubsystems, setExpandedSubsystems] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) => {
    setExpandedSubsystems((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const nav: NavItem[] = [
    { id: "dashboard", label: "Live", icon: Radio },
    { id: "trends", label: "Trends", icon: TrendingUp },
    { id: "storage", label: "Storage", icon: Database },
    { id: "alarms", label: "Alarms", icon: Bell },
    { id: "inspector", label: "Inspector", icon: Settings2 },
  ];

  const savedPackets = bookmarks
    .map((id) => packets.find((p) => packetId(p) === id))
    .filter((p): p is DecodedPacket => p !== undefined);

  const fetchAttempted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!bookmarks.length) return;

    const existingIds = new Set(packets.map((p) => packetId(p)));
    const missingBookmarks = bookmarks.filter(
      (id) => !existingIds.has(id) && !fetchAttempted.current.has(id)
    );

    if (missingBookmarks.length === 0) return;

    missingBookmarks.forEach((id) => fetchAttempted.current.add(id));

    async function fetchMissing() {
      const fetched: DecodedPacket[] = [];
      for (const id of missingBookmarks) {
        const parts = id.split("-");
        if (parts.length !== 3) continue;
        const [ts, apid, seq] = parts;
        try {
          const res = await fetch(`${API_BASE}/api/packets/by-key?apid=${apid}&seq=${seq}&ts=${ts}`);
          if (res.ok) fetched.push(await res.json());
        } catch (e) {
          console.error(`Failed to fetch bookmark ${id}`, e);
        }
      }
      if (fetched.length > 0) addPackets(fetched);
    }

    fetchMissing();
  }, [bookmarks, packets, addPackets]); 

  if (!sidebarOpen) {
    return (
      <aside className="w-12 border-r border-white/5 glass-strong flex flex-col items-center py-2 gap-2 shrink-0">
        <button
          onClick={toggleSidebar}
          className="p-2 hover:bg-white/5 rounded text-muted"
          aria-label="Expand sidebar"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={cn(
                "p-2 rounded",
                activePage === item.id ? "bg-accent/10 text-accent" : "text-slate-300 hover:bg-white/5"
              )}
              title={item.label}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="w-60 border-r border-white/5 glass-strong flex flex-col overflow-hidden shrink-0">
      <div className="flex justify-end p-2 pb-0 shrink-0">
        <button
          onClick={toggleSidebar}
          className="p-1 hover:bg-white/5 rounded text-muted"
          aria-label="Collapse sidebar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      <nav className="p-3 pt-0 space-y-1 shrink-0">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;
          const badge = item.id === "alarms" ? alarms.length : 0;
          return (
            <button
              key={item.id}
              onClick={() => setPage(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active ? "bg-accent/10 text-accent border border-accent/20" : "text-slate-300 hover:bg-white/5"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1 text-left">{item.label}</span>
              {badge > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-red/20 text-accent-red border border-accent-red/30">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="h-px bg-white/5 mx-3 shrink-0" />

      <div className="flex-1 min-h-0 overflow-auto p-3 space-y-4">
        {/* ⭐ COLLAPSIBLE SUBSYSTEMS */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-tertiary mb-2 px-1 flex items-center gap-2">
            <Boxes className="w-3 h-3" /> Subsystems
          </div>
          {!meta ? (
            <div className="text-[11px] text-muted px-1">loading…</div>
          ) : (
            <div className="space-y-1">
              {Object.entries(meta.subsystems ?? {}).map(([key, sub]) => {
                const color = SUBSYSTEM_COLORS[key] ?? sub.color ?? "#8B95A9";
                const cards = Object.entries(sub.cards ?? {});
                const hasCards = cards.length > 0;
                const isExpanded = expandedSubsystems.has(key);

                return (
                  <div key={key}>
                    {/* Subsystem Row */}
                    <button
                        onClick={() => hasCards && toggleExpand(key)}
                        disabled={!hasCards}
                        className={cn(
                          "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors",
                          hasCards
                            ? "hover:bg-white/5 text-slate-300 cursor-pointer"
                            : "text-muted cursor-default",
                          isExpanded && hasCards && "bg-white/5"
                        )}
                      >
                      {hasCards ? (
                        isExpanded ? <ChevronDown className="w-3 h-3 text-muted" /> : <ChevronRight className="w-3 h-3 text-muted" />
                      ) : (
                        <span className="w-3 h-3" /> // spacer for alignment
                      )}
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                      <span className="truncate flex-1">{sub.label}</span>
                      <span className="mono text-[10px] text-muted">({cards.length})</span>
                    </button>

                    {/* Nested Subservices */}
                    {isExpanded && hasCards && (
                      <div className="ml-5 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                        {cards.map(([cardKey, card]) => (
                          <button
                            key={cardKey}
                            onClick={() => {
                              setPacketFilter({
                                unit_sub_id: card.unit_sub_id,
                                service: card.service,
                                subservice: card.subservice,
                              });
                              setPage("inspector");
                            }}
                            className="w-full flex items-center px-2 py-1 rounded text-[11px] text-left hover:bg-white/5 transition-colors group"
                          >
                            {/* ⭐ Add a colored dot or text */}
                            <span 
                              className="truncate flex-1 group-hover:text-white transition-colors" 
                              style={{ color: color }} // This applies the subsystem color to the text
                            >
                              {card.label}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Saved Packets */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-tertiary mb-2 px-1 flex items-center gap-2">
            <Bookmark className="w-3 h-3" /> Saved Packets
            <span className="mono text-[10px] text-muted">({bookmarks.length})</span>
          </div>
          {savedPackets.length === 0 ? (
            <div className="text-[11px] text-muted px-1">None saved</div>
          ) : (
            <div className="space-y-0.5">
              {savedPackets.map((p) => {
                const pid = packetId(p);
                return (
                  <div
                    key={pid}
                    className="group flex items-center justify-between px-2 py-1 text-[11px] rounded hover:bg-white/5 text-slate-300"
                  >
                    <button
                      onClick={() => window.open(`/standalone/packet/${pid}`, "_blank", "width=1000,height=800")}
                      className="flex-1 flex items-center gap-1.5 text-left truncate"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0 text-muted group-hover:text-accent" />
                      <span className="truncate">
                        {new Date(p.timestamp * 1000).toLocaleTimeString()} · Seq {p.seq}
                      </span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleBookmark(pid);
                      }}
                      className="p-1 text-muted hover:text-accent-red hover:bg-white/10 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Unsave"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}