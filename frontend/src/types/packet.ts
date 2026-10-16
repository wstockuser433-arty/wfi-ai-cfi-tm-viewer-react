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

  // PUS-specific (present only when decoded by PusDecoder)
  service_type?: number;
  service_subtype?: number;

  // EBOX-specific
  unit_id?: number;
  unit_sub_id?: number;
  sub_hdr_value?: number;
  sub_hdr_label?: string;
  seq_flags?: number;
}