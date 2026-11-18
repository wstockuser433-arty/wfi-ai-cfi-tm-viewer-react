import { ChevronDown } from "lucide-react";
import { useTelemetry } from "@/store/telemetryStore";

type Props = {
  selected: string[];
  onChange: (names: string[]) => void;
};

type SubsystemEntry = {
  label?: string;
  color?: string;
  cards?: Record<string, unknown>;
};

export function SubsystemFilter({ selected, onChange }: Props) {
  const meta = useTelemetry((s) => s.meta);
  const subsystemsMap =
    (meta as unknown as { subsystems?: Record<string, SubsystemEntry> } | null)
      ?.subsystems ?? {};
  const entries = Object.entries(subsystemsMap);

  const allSelected = selected.length === 0;
  const label = allSelected
    ? "All subsystems"
    : selected.length === 1
    ? entries.find(([key]) => key === selected[0])?.[1].label ?? selected[0]
    : `${selected.length} selected`;

  const toggle = (key: string) => {
    onChange(
      selected.includes(key)
        ? selected.filter((k) => k !== key)
        : [...selected, key]
    );
  };

  return (
    // relative z-50 ensures the dropdown stays above the table
    <div className="relative z-50 group">
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-1.5 text-sm border border-white/10 rounded-md bg-space-800 hover:bg-white/5 text-slate-200"
      >
        <span>{label}</span>
        <ChevronDown className="w-4 h-4 text-muted" />
      </button>
      {/* absolute z-50 with a solid bg (glass-strong or bg-space-800) to prevent transparency overlap */}
      <div className="absolute z-50 mt-1 hidden group-hover:block group-focus-within:block bg-space-900 border border-white/10 rounded-md shadow-xl py-1 min-w-[220px] max-h-72 overflow-auto">
        <button
          type="button"
          className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 text-slate-300"
          onClick={() => onChange([])}
        >
          {allSelected ? "✓ " : ""}All subsystems
        </button>
        {entries.length === 0 && (
          <div className="px-3 py-1.5 text-xs text-muted">no subsystems loaded</div>
        )}
        {entries.map(([key, sub]) => {
          const cards = sub.cards ? Object.keys(sub.cards).length : 0;
          return (
            <label
              key={key}
              className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-white/5 cursor-pointer text-slate-300"
            >
              <input
                type="checkbox"
                checked={selected.includes(key)}
                onChange={() => toggle(key)}
                className="h-3.5 w-3.5"
              />
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: sub.color ?? "#8B95A9" }} />
              <span className="truncate flex-1">{sub.label ?? key}</span>
              <span className="ml-auto mono text-[10px] text-muted">
                {cards}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}