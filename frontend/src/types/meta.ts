export interface FieldSpec {
  name: string;
  offset: number;
  type: "f32" | "f64" | "u8" | "u16" | "u32" | "i8" | "i16" | "i32";
  unit?: string;
  ltl?: number;
  lth?: number;
  htl?: number;
  hth?: number;
  enum?: Record<string, string>;
}

export interface CardSpec {
  label: string;
  unit_sub_id: number;
  service: number;
  subservice: number;
  subsystem: string;
  hw_class: "HW" | "SW";
  fields: FieldSpec[];
  // Apid-like key for frontend convenience (equals unit_sub_id in EBOX)
  apid: number;
}

export interface ApidEntry {
  apid: number;
  subsystem: string;
  card: string;
  label: string;
  unit_sub_id: number;
  service: number;
  subservice: number;
}

export interface MetaResponse {
  unit?: { id: number; label: string };
  subsystems: Record<string, {
    label: string;
    color: string;
    cards: Record<string, {
      label: string;
      apid: number;
      hw_class: "HW" | "SW";
      fields: FieldSpec[];
      unit_id?: number;
      unit_sub_id?: number;
      service?: number;
      subservice?: number;
    }>;
  }>;
  links: unknown[];
  apids: {
    apid: number;
    subsystem: string;
    card: string;
    label: string;
    unit_id?: number;
    unit_sub_id?: number;
    service?: number;
    subservice?: number;
  }[];
}