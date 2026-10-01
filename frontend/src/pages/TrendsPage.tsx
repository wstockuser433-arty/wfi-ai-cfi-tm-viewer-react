import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { useTelemetry } from "@/store/telemetryStore";
import { useIsDark } from "@/hooks/useIsDark";
import { subsystemColor } from "@/lib/colors";
import { MultiSeriesChart } from "@/components/trends/MultiSeriesChart";
import { TrendSparkTable } from "@/components/trends/TrendSparkTable";

export function TrendsPage() {
  const meta = useTelemetry((s) => s.meta);
  const isDark = useIsDark();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(["0x100:cam_fpa_temp", "0x111:ai_soc_temp", "0x131:ppc_dcdc_temp"])
  );

  const availableParams = useMemo(() => {
    if (!meta) return [];
    const out: { key: string; label: string; color: string }[] = [];
    for (const [subKey, sub] of Object.entries(meta.subsystems)) {
      for (const [cardKey, card] of Object.entries(sub.cards)) {
        for (const f of card.fields) {
          if (f.type === "u8" || f.type === "u16") continue;
          out.push({
            key: `0x${card.apid.toString(16).toUpperCase()}:${f.name}`,
            label: `${subKey}/${cardKey}.${f.name}`,
            color: subsystemColor(subKey, isDark),
          });
        }
      }
    }
    return out;
  }, [meta, isDark]);

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