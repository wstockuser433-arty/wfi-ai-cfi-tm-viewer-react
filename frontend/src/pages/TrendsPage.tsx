import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { useTelemetry } from "@/store/telemetryStore";
import { MultiSeriesChart } from "@/components/trends/MultiSeriesChart";
import { TrendSparkTable } from "@/components/trends/TrendSparkTable";

export function TrendsPage() {
  const meta = useTelemetry((s) => s.meta);
  const [selected, setSelected] = useState<Set<string>>(
    new Set(["0x100:cam_fpa_temp", "0x111:ai_soc_temp", "0x131:ppc_dcdc_temp"])
  );

  const availableParams = useMemo(() => {
    if (!meta) return [];
    const out: { key: string; label: string; color: string }[] = [];
    for (const [subKey, sub] of Object.entries(meta.subsystems)) {
      for (const [cardKey, card] of Object.entries(sub.cards)) {
        for (const f of card.fields) {
          if (f.type === "u8" || f.type === "u16") continue; // skip enums/ints
          out.push({
            key: `0x${card.apid.toString(16).toUpperCase()}:${f.name}`,
            label: `${subKey}/${cardKey}.${f.name}`,
            color: sub.color,
          });
        }
      }
    }
    return out;
  }, [meta]);

  const toggle = (key: string) => {
    const next = new Set(selected);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelected(next);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Parameter Selection</h3>
          <span className="text-[11px] text-muted">
            {selected.size} selected · {availableParams.length} available
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-auto">
          {availableParams.map((p) => {
            const active = selected.has(p.key);
            return (
              <button
                key={p.key}
                onClick={() => toggle(p.key)}
                className={`text-[11px] px-2 py-1 rounded border transition-colors mono ${
                  active
                    ? "border-accent-cyan/40 bg-accent-cyan/10 text-accent-cyan"
                    : "border-white/10 text-muted hover:text-white hover:bg-white/5"
                }`}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full mr-1.5"
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