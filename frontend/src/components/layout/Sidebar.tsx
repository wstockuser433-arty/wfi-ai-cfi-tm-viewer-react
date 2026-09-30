import { Radio, History, Bell, Settings2, Boxes, TrendingUp, Database } from "lucide-react";
import { useTelemetry } from "@/store/telemetryStore";
import { useFilters } from "@/store/filterStore";
import { useUiStore, type Page } from "@/store/uiStore";
import { SUBSYSTEM_COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";

interface NavItem {
  id: Page;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function Sidebar() {
  // ─── ALL hooks must be called here, unconditionally ────────────────
  const meta = useTelemetry((s) => s.meta);
  const alarms = useTelemetry((s) => s.alarms);
  const activePage = useUiStore((s) => s.activePage);
  const setPage = useUiStore((s) => s.setPage);

  // Read the whole filter set ONCE. Not a hook inside a loop.
  const subsystems = useFilters((s) => s.subsystems);
  const toggleSubsystem = useFilters((s) => s.toggleSubsystem);

  // ─── Data prep (no hooks below this line) ──────────────────────────
  const nav: NavItem[] = [
    { id: "dashboard",  label: "Live",      icon: Radio },
    { id: "trends",     label: "Trends",    icon: TrendingUp },
    { id: "storage",    label: "Storage",   icon: Database },
    { id: "alarms",     label: "Alarms",    icon: Bell },
    { id: "inspector",  label: "Inspector", icon: Settings2 },
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
                  ? "bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/20"
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

      <div className="p-3 flex-1 min-h-0 overflow-auto">
        <div className="text-[10px] uppercase tracking-widest text-muted mb-2 px-1 flex items-center gap-2">
          <Boxes className="w-3 h-3" /> Subsystems
        </div>

        {!meta ? (
          <div className="text-[11px] text-muted px-1">loading…</div>
        ) : (
          <div className="space-y-0.5">
            {Object.entries(meta.subsystems).map(([key, sub]) => {
              // ✅ just a Set lookup — no hook call
              const active = subsystems.has(key);
              const color = SUBSYSTEM_COLORS[key] ?? "#8B95A9";
              const cardCount = Object.keys(sub.cards).length;

              return (
                <button
                  key={key}
                  onClick={() => {
                    toggleSubsystem(key);
                    // Optional: jump to Inspector when turning ON so the
                    // user immediately sees the effect.
                    if (!subsystems.has(key)) setPage("inspector");
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors",
                    active
                      ? "bg-white/5 text-white"
                      : "text-slate-300 hover:bg-white/5"
                  )}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <span className="truncate flex-1">{sub.label}</span>
                  <span className="mono text-[10px] text-muted">{cardCount}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}