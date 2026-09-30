export interface DecodedField {
  value: number | string;
  unit: string;
  limits: [number | null, number | null];
  status: "OK" | "WARN" | "CRIT";
  // Enum labels: keys are stringified integers (JSON has no int keys)
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