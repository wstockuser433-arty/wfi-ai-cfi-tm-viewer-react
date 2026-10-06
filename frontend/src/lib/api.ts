import { useSettings } from "@/store/settingsStore";

/** Read the current effective values. Falls back to defaults. */
export const getApiBase = () => useSettings.getState().api.apiBase;
export const getWsUrl  = () => useSettings.getState().api.wsUrl;

// Legacy named exports — read at module load. If your app imports these
// directly, you'll want to switch to the getters below for live updates.
export const API_BASE = "http://localhost:8000";
export const WS_URL   = "ws://localhost:8000/ws/telemetry";

// ─── Wire type definitions (unchanged) ────────────────────────
export interface DecodedField {
  value: number | string;
  unit: string;
  limits: [number | null, number | null];
  status: "OK" | "WARN" | "CRIT";
  enum?: Record<string, string>;
}

export interface DecodedPacket {
  cc: number;
  apid: number;
  apid_name: string;
  subsystem: string;
  card: string;
  hw_class: "HW" | "SW";
  seq: number;
  length: number;
  crc_ok: boolean;
  payload_hex: string;
  raw_hex: string;
  fields: Record<string, DecodedField>;
  timestamp: number;
}

export type ParsedField = DecodedField;
export type ParsedPacket = DecodedPacket;