import {
  Radio, History, Bell, Settings2, Boxes, TrendingUp, Database,
  ChevronLeft, ChevronRight, Bookmark, X, ExternalLink
} from "lucide-react";
import { useTelemetry } from "@/store/telemetryStore";
import { useFilters } from "@/store/filterStore";
import { useUiStore, type Page } from "@/store/uiStore";
import { SUBSYSTEM_COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { packetId, type DecodedPacket } from "@/types/packet";
import { useEffect, useRef } from "react";
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

  const subsystems = useFilters((s) => s.subsystems);
  const toggleSubsystem = useFilters((s) => s.toggleSubsystem);

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

    // Mark as attempted immediately so we don't fire duplicates
    missingBookmarks.forEach((id) => fetchAttempted.current.add(id));

    async function fetchMissing() {
      const fetched: DecodedPacket[] = [];
      
      for (const id of missingBookmarks) {
        const parts = id.split("-");
        if (parts.length !== 3) continue;
        const [ts, apid, seq] = parts;
        try {
          const res = await fetch(`${API_BASE}/api/packets/by-key?apid=${apid}&seq=${seq}&ts=${ts}`);
          if (res.ok) {
            const pkt = await res.json();
            fetched.push(pkt);
          }
        } catch (e) {
          console.error(`Failed to fetch bookmark ${id}`, e);
        }
      }

      if (fetched.length > 0) {
        addPackets(fetched);
      }
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
                activePage === item.id
                  ? "bg-accent/10 text-accent"
                  : "text-slate-300 hover:bg-white/5"
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
                active
                  ? "bg-accent/10 text-accent border border-accent/20"
                  : "text-slate-300 hover:bg-white/5"
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
        <div>
          <div className="text-[10px] uppercase tracking-widest text-tertiary mb-2 px-1 flex items-center gap-2">
            <Boxes className="w-3 h-3" /> Subsystems
          </div>
          {!meta ? (
            <div className="text-[11px] text-muted px-1">loading…</div>
          ) : (
            <div className="space-y-0.5">
              {Object.entries(meta.subsystems ?? {}).map(([key, sub]) => {
                const active = subsystems.has(key);
                const color = SUBSYSTEM_COLORS[key] ?? "#8B95A9";
                return (
                  <button
                    key={key}
                    onClick={() => {
                      toggleSubsystem(key);
                      if (!subsystems.has(key)) setPage("inspector");
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors",
                      active ? "bg-white/5 text-white" : "text-slate-300 hover:bg-white/5"
                    )}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                    <span className="truncate flex-1">{sub.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ⭐ UPDATED: Saved Packets */}
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
                      onClick={() => {
                        // Open standalone window
                        window.open(`/standalone/packet/${pid}`, "_blank", "width=1000,height=800");
                      }}
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