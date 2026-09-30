import type { DecodedField, DecodedPacket } from "./packet";

export interface ParameterLatest {
  apid: number;
  subsystem: string;
  card: string;
  param: string;
  field: DecodedField;
  ts: number;
}

export interface ParameterHistoryPoint {
  t: number;
  value: number | string;
  status: "OK" | "WARN" | "CRIT";
}

export interface ParameterSample {
  packet: DecodedPacket;
  field: DecodedField;
}

export interface ParameterSpec {
  name: string;
  subsystem: string;
  card: string;
  apid: number;
  unit: string;
  limits: [number | null, number | null];
  enum?: Record<string, string>;
}