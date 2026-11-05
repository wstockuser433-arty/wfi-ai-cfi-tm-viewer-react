import { useTelemetry } from "@/store/telemetryStore";
import { useIsDark } from "@/hooks/useIsDark";
import { subsystemColor } from "@/lib/colors";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";

const FEATURED: { sub: string; card: string; param: string }[] = [
  { sub: "CAMERA", card: "CAMERA_UNIT_STATUS", param: "power_conv_chip_temp_c" },
  { sub: "CAMERA", card: "CAMERA_UNIT_STATUS", param: "mcu_primary_current_a" },
  { sub: "CAMERA", card: "CAMERA_UNIT_STATUS", param: "mcu_backup_current_a" },
  { sub: "CAMERA", card: "CAMERA_UNIT_STATUS", param: "cmd_rx_count" },
];

export function KpiCards() {
  const meta = useTelemetry((s) => s.meta);
  const latestParam = useTelemetry((s) => s.latestByParam);
  const isDark = useIsDark();

  if (!meta?.subsystems) return null;

  return (
    <div className="grid grid-cols-4 gap-3">
      {FEATURED.map((f) => {
        const sub = meta.subsystems[f.sub];
        const card = sub?.cards?.[f.card];
        if (!card) return null;

        const pkt = latestParam[`${card.apid}:${f.param}`];
        const field = pkt?.fields[f.param];
        const color = subsystemColor(f.sub, isDark);
        const status = field?.status ?? "OK";

        const display =
          field == null
            ? "—"
            : field.enum && field.enum[String(field.value)]
            ? field.enum[String(field.value)]
            : field.value;

        return (
          <Card key={`${f.card}-${f.param}`} className="relative overflow-hidden">
            <div
              className="absolute top-0 left-0 w-full h-0.5"
              style={{ background: color, opacity: 0.75 }}
            />
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-widest text-tertiary truncate">
                {sub.label}
              </span>
              <Badge variant={status === "OK" ? "ok" : status === "WARN" ? "warn" : "crit"}>
                {status}
              </Badge>
            </div>
            <div className="text-[11px] text-tertiary mb-2 truncate">{card.label}</div>
            <div className="flex items-baseline gap-1.5">
              <span className="mono text-2xl font-semibold text-primary truncate">
                {display}
              </span>
              {field?.unit && (
                <span className="text-xs text-tertiary">{field.unit}</span>
              )}
            </div>
            <div className="mono text-[10px] text-tertiary mt-1.5 truncate">
              {f.param}
            </div>
          </Card>
        );
      })}
    </div>
  );
}