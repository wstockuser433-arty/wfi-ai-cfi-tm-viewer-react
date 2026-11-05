import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Cpu, Boxes } from "lucide-react";
import { useTelemetry } from "@/store/telemetryStore";
import { useFilters } from "@/store/filterStore";
import { useIsDark } from "@/hooks/useIsDark";
import { subsystemColor } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";
import type { CardSpec } from "@/types/meta";

export function SubsystemTree() {
  const meta = useTelemetry((s) => s.meta);
  const { subsystems, cards, toggleSubsystem, toggleCard } = useFilters();
  const [open, setOpen] = useState<Record<string, boolean>>({ CAMERA: true });
  const isDark = useIsDark();

  // Build a subsystem → cards list
  const groups = useMemo(() => {
    const out: Record<string, Array<{ key: string; card: CardSpec }>> = {};
    if (!meta?.subsystems) return out;
    for (const [subKey, sub] of Object.entries(meta.subsystems)) {
      out[subKey] = Object.entries(sub.cards ?? {}).map(([key, card]) => ({
        key,
        card,
      }));
    }
    return out;
  }, [meta]);

  if (!meta) return <div className="p-4 text-tertiary text-xs">loading meta…</div>;

  return (
    <div className="p-2">
      <div className="text-[10px] uppercase tracking-widest text-tertiary px-2 mb-2 flex items-center gap-2">
        <Boxes className="w-3 h-3" /> Subsystems
      </div>

      {Object.entries(groups).map(([subKey, cardList]) => {
        const sub = meta.subsystems[subKey];
        const isOpen = open[subKey] ?? false;
        const color = subsystemColor(subKey, isDark);
        const isActive = subsystems.has(subKey);

        return (
          <div key={subKey} className="mb-1">
            <div className="flex items-center">
              <button
                onClick={() =>
                  setOpen((o) => ({ ...o, [subKey]: !isOpen }))
                }
                className="p-1 hover:bg-white/5 rounded"
              >
                {isOpen ? (
                  <ChevronDown className="w-3 h-3 text-tertiary" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-tertiary" />
                )}
              </button>
              <button
                onClick={() => toggleSubsystem(subKey)}
                className={cn(
                  "flex-1 flex items-center gap-2 px-2 py-1 rounded text-xs text-left transition-colors",
                  isActive
                    ? "bg-white/5 text-primary"
                    : "text-secondary hover:bg-white/5 hover:text-primary"
                )}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: color }}
                />
                <span className="truncate">{sub.label}</span>
              </button>
            </div>

            {isOpen && (
              <div className="ml-5 mt-0.5 space-y-0.5">
                {cardList.map(({ key, card }) => {
                  const active = cards.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => toggleCard(key)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] text-left transition-colors",
                        active
                          ? "bg-white/5 text-primary"
                          : "text-tertiary hover:text-primary hover:bg-white/5"
                      )}
                    >
                      <Cpu className="w-3 h-3 opacity-60" />
                      <span className="truncate flex-1">{card.label}</span>
                      <Badge variant="muted" className="!text-[9px] !px-1 !py-0">
                        {card.hw_class}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}