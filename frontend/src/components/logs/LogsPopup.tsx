import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom"; // ⭐ Added
import { X, Search, Download, Trash2 } from "lucide-react";
import { useUiStore } from "@/store/uiStore";
import { WS_URL } from "@/lib/api";
import { cn } from "@/lib/utils";

interface LogEntry {
  ts: number;
  level: string;
  logger: string;
  message: string;
}

const LEVEL_COLORS: Record<string, string> = {
  DEBUG:    "text-tertiary",
  INFO:     "text-secondary",
  WARNING:  "text-accent-amber",
  ERROR:    "text-accent-red",
  CRITICAL: "text-accent-red font-semibold",
};

export function LogsPopup() {
  const open = useUiStore((s) => s.logsOpen);
  const setOpen = useUiStore((s) => s.setLogsOpen);

  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("ALL");
  const [paused, setPaused] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  // Open the WS only when the popup is visible
  useEffect(() => {
    if (!open) return;

    const url = `${WS_URL.replace("/ws/telemetry", "")}/ws/logs`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (evt) => {
      if (pausedRef.current) return;      // don't buffer while paused
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === "backlog") {
          setEntries(msg.entries as LogEntry[]);
        } else if (msg.type === "entry") {
          setEntries((prev) => [...prev.slice(-4999), msg.entry as LogEntry]);
        }
      } catch (e) {
        console.error("[logs] bad frame", e);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [open]);

  // Auto-scroll unless paused or filter active
  useEffect(() => {
    if (paused || filter || levelFilter !== "ALL") return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, paused, filter, levelFilter]);

  const filtered = entries.filter((e) => {
    if (levelFilter !== "ALL" && e.level !== levelFilter) return false;
    if (filter && !e.message.toLowerCase().includes(filter.toLowerCase())
        && !e.logger.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });

  if (!open) return null;

  // ⭐ Wrap the entire modal in a portal to escape local stacking contexts
  return createPortal(
    // ⭐ Changed z-50 to z-[9999] to beat Storage's z-[100] cards
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[1100px] max-w-[95vw] h-[80vh] glass-strong rounded-lg shadow-2xl flex flex-col">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2">
            <ScrollTextIcon />
            <h2 className="text-sm font-semibold text-primary">Live Logs</h2>
            <span className="text-[10px] text-tertiary mono">
              {filtered.length} / {entries.length} entries
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPaused((p) => !p)}
              className={cn(
                "px-2 py-1 text-[11px] rounded border",
                paused
                  ? "bg-accent-amber/10 border-accent-amber/30 text-accent-amber"
                  : "border-white/10 text-tertiary hover:text-primary"
              )}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <a
              href={`${WS_URL.replace("/ws/telemetry", "")}/api/logs/download`}
              download
              className="p-1.5 hover:bg-white/5 rounded"
              title="Download full log"
            >
              <Download className="w-4 h-4 text-tertiary" />
            </a>
            <button
              onClick={() => setEntries([])}
              className="p-1.5 hover:bg-white/5 rounded"
              title="Clear view (doesn't delete file)"
            >
              <Trash2 className="w-4 h-4 text-tertiary" />
            </button>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 hover:bg-white/5 rounded"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-tertiary" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-4 py-2 border-b border-white/5 flex items-center gap-3 shrink-0">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-tertiary" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by message or logger…"
              className="w-full bg-white/5 border border-white/10 rounded-md pl-8 pr-3 py-1.5 text-xs placeholder:text-tertiary focus:outline-none focus:border-accent/40"
            />
          </div>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-md px-2 py-1.5 text-xs mono"
          >
            {["ALL", "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"].map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </div>

        {/* Body */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto px-4 py-2 mono text-[11px] leading-relaxed"
        >
          {filtered.length === 0 ? (
            <div className="text-tertiary text-center py-8">
              no log entries{filter || levelFilter !== "ALL" ? " match your filter" : " yet"}
            </div>
          ) : (
            filtered.map((e, i) => (
              <div key={i} className="flex items-start gap-2 py-0.5 border-b border-white/5">
                <span className="text-tertiary shrink-0 w-[130px]">
                  {new Date(e.ts * 1000).toLocaleTimeString()}
                </span>
                <span className={cn("shrink-0 w-[60px]", LEVEL_COLORS[e.level] ?? "text-secondary")}>
                  {e.level}
                </span>
                <span className="text-tertiary shrink-0 w-[200px] truncate" title={e.logger}>
                  {e.logger.split(".").pop()}
                </span>
                <span className="text-secondary flex-1 break-words">
                  {e.message}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body // ⭐ Portal target
  );
}

function ScrollTextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         className="text-accent">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="16" y2="17"/>
    </svg>
  );
}