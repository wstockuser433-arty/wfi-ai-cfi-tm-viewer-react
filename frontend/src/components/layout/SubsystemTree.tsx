import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Cpu, Boxes } from "lucide-react";
import { useTelemetry } from "@/store/telemetryStore";
import { useFilters } from "@/store/filterStore";
import { useIsDark } from "@/hooks/useIsDark";
import { subsystemColor } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";

const SUBSYSTEM_LABELS: Record<string, string> = {
  CAMERA: "Camera Subsystem",
  CDPM_P: "CDPM (Primary)",
  CDPM_R: "CDPM (Redundant)",
  CTPU_P: "CTPU (Primary)",
  CTPU_R: "CTPU (Redundant)",
  UNIT:   "Unit / Mode",
};

export function SubsystemTree() {
  const meta = useTelemetry((s) => s.meta);
  const { subsystems, cards, toggleSubsystem, toggleCard } = useFilters();
  const [open, setOpen] = useState<Record<string, boolean>>({
    CAMERA: true,
    CDPM_P: true,
  });
  const isDark = useIsDark();

  // Group cards by subsystem on the fly (no meta.subsystems in EBOX schema)
  const groupedCards = useMemo(() => {
    const groups: Record<string, Array<{ key: string; label: string; hw: string }>> = {};
    if (!meta?.cards) return groups;
    for (const [key, card] of Object.entries(meta.cards)) {
      const subKey = card.subsystem ?? "EBOX";
      (groups[subKey] ??= []).push({
        key,
        label: card.label,
        hw: card.hw_class,
      });
    }
    return groups;
  }, [meta]);

  if (!meta) return <div className="p-4 text-tertiary text-xs">loading meta…</div>;

  return (
    <div className="p-2">
      <div className="text-[10px] uppercase tracking-widest text-tertiary px-2 mb-2 flex items-center gap-2">
        <Boxes className="w-3 h-3" /> Subsystems
      </div>

      {Object.entries(groupedCards).map(([key, cardsList]) => {
        const isOpen = open[key] ?? false;
        const color = subsystemColor(key, isDark);
        const isActive = subsystems.has(key);

        return (
          <div key={key} className="mb-1">
            <div className="flex items-center">
              <button
                onClick={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}
                className="p-1 hover:bg-white/5 rounded"
              >
                {isOpen ? (
                  <ChevronDown className="w-3 h-3 text-tertiary" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-tertiary" />
                )}
              </button>
              <button
                onClick={() => toggleSubsystem(key)}
                className={cn(
                  "flex-1 flex items-center gap-2 px-2 py-1 rounded text-xs text-left transition-colors",
                  isActive
                    ? "bg-white/5 text-primary"
                    : "text-secondary hover:bg-white/5 hover:text-primary"
                )}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="truncate">
                  {SUBSYSTEM_LABELS[key] ?? key}
                </span>
              </button>
            </div>

            {isOpen && (
              <div className="ml-5 mt-0.5 space-y-0.5">
                {cardsList.map((card) => {
                  const active = cards.has(card.key);
                  return (
                    <button
                      key={card.key}
                      onClick={() => toggleCard(card.key)}
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
                        {card.hw}
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