import { useFilters } from "@/store/filterStore";
import { useTelemetry } from "@/store/telemetryStore";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export function FilterBar() {
  const meta = useTelemetry(s => s.meta);
  const { hwClass, setHwClass, search, setSearch, reset } = useFilters();
  if (!meta) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center bg-white/5 border border-white/10 rounded-md p-0.5">
        {(["ALL", "HW", "SW"] as const).map(h => (
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

      <div className="flex-1 min-w-[200px] relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search parameter…"
          className="w-full bg-white/5 border border-white/10 rounded-md pl-8 pr-3 py-1.5 text-xs placeholder:text-muted focus:outline-none focus:border-accent-cyan/40"
        />
      </div>

      <button onClick={reset} className="text-[11px] text-muted hover:text-white">
        Reset
      </button>
    </div>
  );
}