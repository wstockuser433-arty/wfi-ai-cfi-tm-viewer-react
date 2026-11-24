export interface DecodedField {
  value: number | string | null;
  unit: string;
  limits: [number | null, number | null];
  status: "OK" | "WARN" | "CRIT";
  enum?: Record<string, string> | null;
}

export interface DecodedPacket {
  id?: number;
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
  // EBOX specific
  unit_id?: number;
  unit_sub_id?: number;
  service_type?: number;
  service_subtype?: number;
  sub_hdr_value?: number;
  sub_hdr_label?: string;
  seq_flags?: number;
}

// ⭐ Helper to generate a stable ID for a packet
export function packetId(p: { timestamp: number; apid: number; seq: number }): string {
  // ⭐ Round to 3 decimal places (milliseconds) so WS floats (1795452749.84521) 
  // and DB ISO strings (1795452749.845) produce the exact same ID.
  const tsMs = Math.round(p.timestamp * 1000) / 1000;
  return `${tsMs}-${p.apid}-${p.seq}`;
}