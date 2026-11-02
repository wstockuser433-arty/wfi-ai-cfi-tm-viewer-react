import { useState, useMemo, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { useTelemetry } from "@/store/telemetryStore";
import { useIsDark } from "@/hooks/useIsDark";
import { subsystemColor } from "@/lib/colors";
import { MultiSeriesChart } from "@/components/trends/MultiSeriesChart";
import { TrendSparkTable } from "@/components/trends/TrendSparkTable";

export function TrendsPage() {
  const meta = useTelemetry((s) => s.meta);
  const isDark = useIsDark();

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const availableParams = useMemo(() => {
  if (!meta?.subsystems) return [];
  const out: { key: string; label: string; color: string }[] = [];
  
  for (const [subKey, sub] of Object.entries(meta.subsystems)) {
    for (const [cardKey, card] of Object.entries(sub.cards ?? {})) {
      for (const f of card.fields ?? []) {
        // Skip raw ADC counts — show physical/calc values only
        if (f.name.endsWith("_raw")) continue;
        // Skip bitfields (they're sub-fields of a parent u8)
        if (f.name.includes(".")) continue;
        
        out.push({
          key: `${card.apid}:${f.name}`,
          label: `${subKey}/${cardKey}.${f.name}`,
          color: subsystemColor(subKey, isDark),
        });
      }
    }
  }
  return out;
}, [meta, isDark]);

  // Initialize with default fields once meta loads.
  // We select fields that produce numeric values even when ADC is 0,
  // so the chart isn't blank while testing with the simulator.
  // Initialize with 3 default fields once meta loads.
  // Force the defaults on first load so it always selects these 3.
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (!hasInitialized && availableParams.length > 0) {
      const defaults = availableParams
        .filter((p) => 
          p.key.includes("power_conv_chip_temp_c") ||
          p.key.includes("mcu_primary_current_a") ||
          p.key.includes("ntc_primary_ch1_c")
        )
        .map((p) => p.key);
      
      if (defaults.length > 0) {
        setSelected(new Set(defaults));
      }
      setHasInitialized(true);
    }
  }, [availableParams, hasInitialized]);

  const toggle = (key: string) => {
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelected(next);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-primary">Parameter Selection</h3>
          <span className="text-[11px] text-tertiary">
            {selected.size} selected · {availableParams.length} available
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-auto pr-1">
          {availableParams.map((p) => {
            const active = selected.has(p.key);
            return (
              <button
                key={p.key}
                onClick={() => toggle(p.key)}
                className={`text-[11px] px-2 py-1 rounded border transition-colors mono ${
                  active
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-subtle text-tertiary hover:text-primary hover:bg-white/5"
                }`}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                  style={{ background: p.color }}
                />
                {p.label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="min-h-[400px]">
        <MultiSeriesChart selectedKeys={Array.from(selected)} />
      </Card>

      <Card>
        <TrendSparkTable />
      </Card>
    </div>
  );
}