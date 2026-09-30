import { Radio, History, Bell, Settings2, Boxes } from "lucide-react";
import { useTelemetry } from "@/store/telemetryStore";
import { useFilters } from "@/store/filterStore";
import { SUBSYSTEM_COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

export function Sidebar() {
  const meta = useTelemetry((s) => s.meta);
  const alarms = useTelemetry((s) => s.alarms);
  const { subsystems, toggleSubsystem } = useFilters();

  const nav: NavItem[] = [
    { id: "live", label: "Live", icon: Radio },
    { id: "history", label: "History", icon: History },
    { id: "alarms", label: "Alarms", icon: Bell, badge: alarms.length },
    { id: "config", label: "Config", icon: Settings2 },
  ];

  return (
    <aside className="w-60 border-r border-white/5 glass-strong flex flex-col overflow-hidden">
      {/* Top nav */}
      <nav className="p-3 space-y-1 shrink-0">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = item.id === "live";
          return (
            <button
              key={item.id}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20"
                  : "text-slate-300 hover:bg-white/5"
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-red/20 text-accent-red border border-accent-red/30">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="h-px bg-white/5 mx-3 shrink-0" />

      {/* Subsystems */}
      <div className="p-3 flex-1 min-h-0 overflow-auto">
        <div className="text-[10px] uppercase tracking-widest text-muted mb-2 px-1 flex items-center gap-2">
          <Boxes className="w-3 h-3" /> Subsystems
        </div>

        {!meta ? (
          <div className="text-[11px] text-muted px-1">loading…</div>
        ) : (
          <div className="space-y-0.5">
            {Object.entries(meta.subsystems).map(([key, sub]) => {
              const active = subsystems.has(key);
              const color = SUBSYSTEM_COLORS[key] ?? "#8B95A9";
              return (
                <button
                  key={key}
                  onClick={() => toggleSubsystem(key)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors",
                    active
                      ? "bg-white/5 text-white"
                      : "text-slate-300 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <span className="truncate flex-1">{sub.label}</span>
                  <span className="mono text-[10px] text-muted">
                    {Object.keys(sub.cards).length}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* RS-422 Links */}
        {meta && meta.links.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/5">
            <div className="text-[10px] uppercase tracking-widest text-muted mb-2 px-1">
              RS-422 Links
            </div>
            <div className="space-y-0.5">
              {meta.links.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center gap-2 px-2 py-1 text-[11px] text-muted"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: SUBSYSTEM_COLORS.LINKS }}
                  />
                  <span className="truncate">{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}