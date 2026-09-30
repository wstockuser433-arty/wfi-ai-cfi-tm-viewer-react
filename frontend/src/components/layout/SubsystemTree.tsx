import { useState } from "react";
import { ChevronRight, ChevronDown, Cpu, Boxes, Radio } from "lucide-react";
import { useTelemetry } from "@/store/telemetryStore";
import { useFilters } from "@/store/filterStore";
import { SUBSYSTEM_COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";
import { Badge } from "../ui/badge";

export function SubsystemTree() {
  const meta = useTelemetry(s => s.meta);
  const { subsystems, cards, toggleSubsystem, toggleCard } = useFilters();
  const [open, setOpen] = useState<Record<string, boolean>>({ CAMERA: true, CDPM_P: true });

  if (!meta) return <div className="p-4 text-muted text-xs">loading meta…</div>;

  return (
    <div className="p-2">
      <div className="text-[10px] uppercase tracking-widest text-muted px-2 mb-2 flex items-center gap-2">
        <Boxes className="w-3 h-3" /> Subsystems
      </div>

      {Object.entries(meta.subsystems).map(([key, sub]) => {
        const isOpen = open[key] ?? false;
        const color = SUBSYSTEM_COLORS[key] ?? "#8B95A9";
        const isActive = subsystems.has(key);

        return (
          <div key={key} className="mb-1">
            <div className="flex items-center">
              <button
                onClick={() => setOpen(o => ({ ...o, [key]: !isOpen }))}
                className="p-1 hover:bg-white/5 rounded"
              >
                {isOpen ? <ChevronDown className="w-3 h-3 text-muted" /> : <ChevronRight className="w-3 h-3 text-muted" />}
              </button>
              <button
                onClick={() => toggleSubsystem(key)}
                className={cn(
                  "flex-1 flex items-center gap-2 px-2 py-1 rounded text-xs text-left transition-colors",
                  isActive ? "bg-white/5 text-white" : "text-slate-300 hover:bg-white/5"
                )}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span className="truncate">{sub.label}</span>
              </button>
            </div>

            {isOpen && (
              <div className="ml-5 mt-0.5 space-y-0.5">
                {Object.entries(sub.cards).map(([ckey, card]) => {
                  const active = cards.has(ckey);
                  return (
                    <button
                      key={ckey}
                      onClick={() => toggleCard(ckey)}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] text-left transition-colors",
                        active ? "bg-white/5 text-white" : "text-muted hover:text-white hover:bg-white/5"
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

      <div className="mt-3 pt-3 border-t border-white/5">
        <div className="text-[10px] uppercase tracking-widest text-muted px-2 mb-2 flex items-center gap-2">
          <Radio className="w-3 h-3" /> RS-422 Links
        </div>
        {meta.links.map(l => (
          <button
            key={l.id}
            className="w-full flex items-center gap-2 px-2 py-1 rounded text-[11px] text-muted hover:text-white hover:bg-white/5"
          >
            <span className="w-2 h-2 rounded-full" style={{ background: SUBSYSTEM_COLORS.LINKS }} />
            <span className="truncate">{l.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}