import { useMemo } from "react";
import { X } from "lucide-react";
import { useFilters } from "@/store/filterStore";
import { useTelemetry } from "@/store/telemetryStore";
import { SUBSYSTEM_COLORS } from "@/lib/colors";
import { cn } from "@/lib/utils";

const SUBSYSTEM_LABELS: Record<string, string> = {
  CAMERA: "Camera Subsystem",
  CDPM_P: "CDPM (Primary)",
  CDPM_R: "CDPM (Redundant)",
  CTPU_P: "CTPU (Primary)",
  CTPU_R: "CTPU (Redundant)",
  UNIT:   "Unit / Mode",
};

export function FilterBar() {
  const meta = useTelemetry((s) => s.meta);
  const {
    subsystems,
    cards,
    hwClass,
    setHwClass,
    toggleSubsystem,
    toggleCard,
    reset,
  } = useFilters();

  // Derive the list of subsystems from apids — no meta.subsystems in EBOX schema
  const subsystemKeys = useMemo(() => {
    if (!meta?.apids) return [] as string[];
    const keys = new Set<string>();
    for (const a of meta.apids) keys.add(a.subsystem);
    return Array.from(keys).sort();
  }, [meta]);

  if (!meta) return null;

  const hasFilters =
    subsystems.size > 0 || cards.size > 0 || hwClass !== "ALL";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* HW / SW / ALL chip group */}
      <div className="flex items-center bg-white/5 border border-white/10 rounded-md p-0.5">
        {(["ALL", "HW", "SW"] as const).map((h) => (
          <button
            key={h}
            onClick={() => setHwClass(h)}
            className={cn(
              "px-2.5 py-1 text-[11px] rounded mono transition-colors",
              hwClass === h
                ? "bg-accent/15 text-accent"
                : "text-tertiary hover:text-primary"
            )}
          >
            {h}
          </button>
        ))}
      </div>

      {/* Subsystem chips (active filters) */}
      {Array.from(subsystems).map((s) => {
        const color = SUBSYSTEM_COLORS[s] ?? "#8B95A9";
        const label = SUBSYSTEM_LABELS[s] ?? s;
        return (
          <button
            key={s}
            onClick={() => toggleSubsystem(s)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-white/5 border border-white/10 hover:bg-white/10"
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: color }}
            />
            <span>{label}</span>
            <X className="w-3 h-3 text-tertiary" />
          </button>
        );
      })}

      {/* Card chips (active filters) */}
      {Array.from(cards).map((c) => {
        const card = meta.cards?.[c];
        const label = card?.label ?? c;
        return (
          <button
            key={c}
            onClick={() => toggleCard(c)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-[11px] bg-white/5 border border-white/10 hover:bg-white/10"
          >
            <span>{label}</span>
            <X className="w-3 h-3 text-tertiary" />
          </button>
        );
      })}

      {hasFilters && (
        <button
          onClick={reset}
          className="text-[11px] text-tertiary hover:text-primary ml-2"
        >
          Clear all
        </button>
      )}

      {/* Optional: "show all subsystem keys" hint when no filter is active */}
      {!hasFilters && subsystemKeys.length > 0 && (
        <span className="text-[11px] text-tertiary">
          {subsystemKeys.length} subsystems · no filter active
        </span>
      )}
    </div>
  );
}