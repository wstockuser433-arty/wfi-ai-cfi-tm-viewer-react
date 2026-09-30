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
  apid: number;
  hw_class: "HW" | "SW";
  fields: FieldSpec[];
}

export interface SubsystemSpec {
  label: string;
  color: string;
  cards: Record<string, CardSpec>;
}

export interface LinkSpec {
  id: string;
  label: string;
  apid: number;
  fields: FieldSpec[];
}

export interface MetaResponse {
  subsystems: Record<string, SubsystemSpec>;
  links: LinkSpec[];
  apids: { apid: number; subsystem: string; card: string; label: string }[];
}