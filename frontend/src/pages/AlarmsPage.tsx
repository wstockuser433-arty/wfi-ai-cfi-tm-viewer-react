import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTelemetry, type Alarm } from "@/store/telemetryStore";
import { API_BASE } from "@/lib/api";
import { AlertCircle, Bookmark, RefreshCw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export function AlarmsPage() {
  const sessionAlarms = useTelemetry((s) => s.alarms);
  const clearAlarms = useTelemetry((s) => s.clearAlarms);
  
  // ⭐ State for "All Alarms" tab
  const [activeTab, setActiveTab] = useState<"session" | "all">("session");
  const [dbAlarms, setDbAlarms] = useState<Alarm[]>([]);
  const [loadingDb, setLoadingDb] = useState(false);

  // Fetch from Postgres when the "All" tab is clicked
  async function fetchDbAlarms() {
    setLoadingDb(true);
    try {
      const res = await fetch(`${API_BASE}/api/alarms?limit=500`);
      if (!res.ok) throw new Error("Failed to fetch alarms");
      const data = await res.json();
      
      // ⭐ Handle the {alarms: [...]} wrapper
      const rows = data.alarms ?? [];
      
      const mapped: Alarm[] = rows.map((r: any) => ({
        id: `db-${r.id}`,
        db_id: Number(r.id),
        packet_id: r.packet_id ?? undefined,   // ⭐ carry it over
        ts: new Date(r.ts).getTime() / 1000,
        severity: r.severity,
        subsystem: r.subsystem,
        card: r.card,
        apid: 0,
        param: r.param_name,
        message: r.message
      }));
      setDbAlarms(mapped);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDb(false);
    }
  }

  useEffect(() => {
    if (activeTab === "all" && dbAlarms.length === 0) {
      fetchDbAlarms();
    }
  }, [activeTab]);

  const displayAlarms = activeTab === "session" ? [...sessionAlarms].reverse() : dbAlarms;

  // Counts for the header cards
  const total = displayAlarms.length;
  const warns = displayAlarms.filter((a) => a.severity === "WARN").length;
  const crits = displayAlarms.filter((a) => a.severity === "CRIT").length;

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      {/* ─── Header Stats ─── */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-[10px] uppercase text-muted tracking-wider mb-1">Total</div>
          <div className="text-2xl font-semibold text-slate-100">{total}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] uppercase text-accent-amber tracking-wider mb-1">Warn</div>
          <div className="text-2xl font-semibold text-accent-amber">{warns}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[10px] uppercase text-accent-red tracking-wider mb-1">Crit</div>
          <div className="text-2xl font-semibold text-accent-red">{crits}</div>
        </Card>
      </div>

      {/* ─── Tabs & Controls ─── */}
      <div className="flex items-center justify-between">
        <div className="flex space-x-1 bg-white/5 p-1 rounded-md border border-white/10">
          <button
            onClick={() => setActiveTab("session")}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-sm transition-colors",
              activeTab === "session" ? "bg-accent/20 text-accent" : "text-muted hover:text-slate-200"
            )}
          >
            Current Session
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-sm transition-colors",
              activeTab === "all" ? "bg-accent/20 text-accent" : "text-muted hover:text-slate-200"
            )}
          >
            All Alarms (DB)
          </button>
        </div>
        
        {activeTab === "session" && sessionAlarms.length > 0 && (
          <Button onClick={clearAlarms} className="bg-transparent hover:bg-white/5 text-muted hover:text-red-400 text-xs">
            Clear Session
          </Button>
        )}
        {activeTab === "all" && (
          <Button onClick={fetchDbAlarms} disabled={loadingDb} className="bg-transparent hover:bg-white/5 text-xs flex items-center gap-2">
            <RefreshCw className={cn("w-3.5 h-3.5", loadingDb && "animate-spin")} /> Refresh
          </Button>
        )}
      </div>

      {/* ─── Alarm List ─── */}
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-white/5 bg-white/5 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Alarm Log</h3>
          {loadingDb && <span className="text-xs text-muted">Fetching from DB…</span>}
        </div>
        
        <div className="divide-y divide-white/5 max-h-[600px] overflow-auto">
          {displayAlarms.length === 0 && !loadingDb && (
            <div className="p-8 text-center text-muted text-sm flex flex-col items-center">
              <AlertCircle className="w-8 h-8 mb-2 opacity-20" />
              {activeTab === "session" ? "No alarms in this session." : "No alarms in database."}
            </div>
          )}

          {displayAlarms.map((a) => (
            <div key={a.id} className="flex gap-3 p-4 hover:bg-white/[0.02] transition-colors">
              <div className={cn(
                "mt-0.5 flex items-center justify-center w-6 h-6 rounded-full shrink-0",
                a.severity === "CRIT" ? "bg-accent-red/10 text-accent-red" : "bg-accent-amber/10 text-accent-amber"
              )}>
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Badge variant={a.severity === "CRIT" ? "crit" : "warn"}>{a.severity}</Badge>
                    <span className="text-xs text-muted font-mono">{a.subsystem} / {a.card}</span>
                  </div>
                  <span className="text-xs text-tertiary font-mono">
                    {new Date(a.ts * 1000).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-slate-200 font-mono truncate" title={a.message}>
                  {a.message}
                </div>
              </div>

              {/* Optional: Save/Bookmark button per alarm */}
              <div className="shrink-0 flex items-center ml-4">
                {a.packet_id && (
                  <Button 
                    onClick={() => {
                      // This jumps to the Inspector with the packet
                      window.open(`/standalone/packet/${a.packet_id}`, "_blank");
                    }}
                    className="bg-white/5 hover:bg-white/10 text-xs py-1 h-7 px-2"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" /> View Packet
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}