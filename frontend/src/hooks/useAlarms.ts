import { useMemo } from "react";
import { useTelemetry } from "@/store/telemetryStore";
import type { AlarmStats } from "@/types/alarm";

export function useAlarms() {
  const alarms = useTelemetry((s) => s.alarms);
  const clear = useTelemetry((s) => s.clearAlarms);

  const stats: AlarmStats = useMemo(() => {
    let warn = 0, crit = 0;
    for (const a of alarms) {
      if (a.severity === "CRIT") crit++;
      else warn++;
    }
    return { total: alarms.length, warn, crit, active: alarms.length };
  }, [alarms]);

  const bySubsystem = useMemo(() => {
    const map: Record<string, typeof alarms> = {};
    for (const a of alarms) {
      (map[a.subsystem] ??= []).push(a);
    }
    return map;
  }, [alarms]);

  return { alarms, clear, stats, bySubsystem };
}