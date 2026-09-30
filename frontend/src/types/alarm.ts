export type AlarmSeverity = "WARN" | "CRIT";
export type AlarmState = "active" | "acked" | "cleared";

export interface AlarmEvent {
  id: string;
  ts: number;
  severity: AlarmSeverity;
  subsystem: string;
  card: string;
  apid: number;
  param: string;
  value: number | string;
  unit: string;
  limits: [number | null, number | null];
  message: string;
  state: AlarmState;
}

export interface AlarmStats {
  total: number;
  warn: number;
  crit: number;
  active: number;
}