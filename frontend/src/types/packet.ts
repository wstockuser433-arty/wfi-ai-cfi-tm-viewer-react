export interface DecodedField {
  value: number | string | null;
  unit: string;
  limits: [number | null, number | null];
  status: "OK" | "WARN" | "CRIT";
  enum?: Record<string, string> | null;
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
export function packetId(p: DecodedPacket): string {
  return `${p.timestamp}-${p.apid}-${p.seq}`;
}