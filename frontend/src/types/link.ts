export type LinkState = "UP" | "DOWN" | "DEGRADED" | "UNKNOWN";

export interface LinkSnapshot {
  id: string;
  label: string;
  apid: number;
  state: LinkState;
  crcErrCount: number;
  frameErrCount: number;
  rxRateKbps: number;
  txRateKbps: number;
  latencyUs: number;
  updatedAt: number;
}

export interface LinkHistoryPoint {
  t: number;
  state: LinkState;
  crcErrCount: number;
  latencyUs: number;
}