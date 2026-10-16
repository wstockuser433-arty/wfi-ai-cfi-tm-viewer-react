import { useMemo } from "react";
import { Radio, Bell, Settings2, Boxes, TrendingUp, Database } from "lucide-react";
import { useTelemetry } from "@/store/telemetryStore";
import { useFilters } from "@/store/filterStore";
import { useUiStore, type Page } from "@/store/uiStore";
import { useIsDark } from "@/hooks/useIsDark";
import { subsystemColor } from "@/lib/colors";
import { cn } from "@/lib/utils";

const SUBSYSTEM_LABELS: Record<string, string> = {
  CAMERA: "Camera Subsystem",
  CDPM_P: "CDPM (Primary)",
  CDPM_R: "CDPM (Redundant)",
  CTPU_P: "CTPU (Primary)",
  CTPU_R: "CTPU (Redundant)",
  UNIT:   "Unit / Mode",
};

export function Sidebar() {
  const meta = useTelemetry((s) => s.meta);
  const alarms = useTelemetry((s) => s.alarms);
  const activePage = useUiStore((s) => s.activePage);
  const setPage = useUiStore((s) => s.setPage);

  const subsystems = useFilters((s) => s.subsystems);
  const toggleSubsystem = useFilters((s) => s.toggleSubsystem);

  const isDark = useIsDark();

  // Group apids by subsystem on the fly
  const subsystemGroups = useMemo(() => {
    const groups: Record<string, { cards: number }> = {};
    if (!meta) return groups;
    for (const a of meta.apids) {
      const g = (groups[a.subsystem] ??= { cards: 0 });
      g.cards += 1;
    }
    return groups;
  }, [meta]);

  const nav: { id: Page; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "dashboard", label: "Live",      icon: Radio },
    { id: "trends",    label: "Trends",    icon: TrendingUp },
    { id: "storage",   label: "Storage",   icon: Database },
    { id: "alarms",    label: "Alarms",    icon: Bell },
    { id: "inspector", label: "Inspector", icon: Settings2 },
  ];

  return (
    <aside className="w-60 border-r border-white/5 glass-strong flex flex-col overflow-hidden">
      <nav className="p-3 space-y-1 shrink-0">
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
                  : "text-secondary hover:bg-white/5 hover:text-primary"
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

      <div className="p-3 flex-1 min-h-0 overflow-auto">
        <div className="text-[10px] uppercase tracking-widest text-tertiary mb-2 px-1 flex items-center gap-2">
          <Boxes className="w-3 h-3" /> Subsystems
        </div>

        {!meta ? (
          <div className="text-[11px] text-tertiary px-1">loading…</div>
        ) : (
          <div className="space-y-0.5">
            {Object.entries(subsystemGroups).map(([key, info]) => {
              const active = subsystems.has(key);
              const color = subsystemColor(key, isDark);
              return (
                <button
                  key={key}
                  onClick={() => {
                    toggleSubsystem(key);
                    if (!subsystems.has(key)) setPage("inspector");
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors",
                    active
                      ? "bg-white/5 text-primary"
                      : "text-secondary hover:bg-white/5 hover:text-primary"
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <span className="truncate flex-1">
                    {SUBSYSTEM_LABELS[key] ?? key}
                  </span>
                  <span className="mono text-[10px] text-tertiary">
                    {info.cards}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* No RS-422 links section — EBOX mode has none */}
      </div>
    </aside>
  );
}