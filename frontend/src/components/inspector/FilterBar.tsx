import { X } from "lucide-react";
import { useFilters } from "@/store/filterStore";
import { useTelemetry } from "@/store/telemetryStore";
import { SUBSYSTEM_COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";

export function FilterBar() {
  const meta = useTelemetry((s) => s.meta);
  const { subsystems, cards, hwClass, setHwClass, toggleSubsystem, toggleCard, reset } =
    useFilters();

  const hasFilters = subsystems.size > 0 || cards.size > 0 || hwClass !== "ALL";

  if (!meta) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* HW/SW chip group */}
      <div className="flex items-center bg-white/5 border border-white/10 rounded-md p-0.5">
        {(["ALL", "HW", "SW"] as const).map((h) => (
          <button
            key={h}
            onClick={() => setHwClass(h)}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded mono transition-colors",
              hwClass === h ? "bg-accent-cyan/15 text-accent-cyan" : "text-muted hover:text-white"
            )}
          >
            {h}
          </button>
        ))}
      </div>

      {/* Active subsystem chips */}
      {Array.from(subsystems).map((s) => {
        const color = SUBSYSTEM_COLORS[s] ?? "#8B95A9";
        return (
          <button
            key={s}
            onClick={() => toggleSubsystem(s)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-white/5 border border-white/10 hover:bg-white/10"
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            <span>{meta.subsystems[s]?.label ?? s}</span>
            <X className="w-3 h-3 text-muted" />
          </button>
        );
      })}

      {/* Active card chips */}
      {Array.from(cards).map((c) => (
        <button
          key={c}
          onClick={() => toggleCard(c)}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-white/5 border border-white/10 hover:bg-white/10"
        >
          <span>{c}</span>
          <X className="w-3 h-3 text-muted" />
        </button>
      ))}

      {hasFilters && (
        <button
          onClick={reset}
          className="text-[11px] text-muted hover:text-white ml-2"
        >
          Clear all
        </button>
      )}
    </div>
  );
}