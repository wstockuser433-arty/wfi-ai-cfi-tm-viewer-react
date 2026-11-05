// ==============================================================
// Mirror of what the backend's EboxRegistry.meta() actually returns
// ==============================================================

export interface FieldSpec {
  name: string;
  offset: number;
  type: "f32" | "f64" | "u8" | "u16" | "u24" | "u32" | "i8" | "i16" | "i32";
  unit?: string;
  ltl?: number; lth?: number; htl?: number; hth?: number;
  calc?: string;
  calc_from?: string;
  enum?: Record<string, string>;
  bits?: Array<{ name: string; bit?: number; low?: number; high?: number }>;
}

export interface CardSpec {
  label: string;
  apid: number;
  hw_class: "HW" | "SW";
  fields: FieldSpec[];
  unit_id?: number;
  unit_sub_id?: number;
  service?: number;
  subservice?: number;
}

export interface SubsystemSpec {
  label: string;
  color: string;
  cards: Record<string, CardSpec>;
}

export interface ApidEntry {
  apid: number;
  subsystem: string;
  card: string;
  label: string;
  unit_id?: number;
  unit_sub_id?: number;
  service?: number;
  subservice?: number;
}

export interface LinkSpec {
  id: string;
  label: string;
  apid: number;
  fields: FieldSpec[];
}

export interface MetaResponse {
  unit?: { id: number; label: string };
  subsystems: Record<string, SubsystemSpec>;
  links: LinkSpec[];
  apids: ApidEntry[];
  // Optional flat card map — provided by some decoder modes
  cards?: Record<string, CardSpec>;
}

// ─── Helper: flatten subsystems → cards ────────────────────
export function getAllCards(meta: MetaResponse | null): Record<string, CardSpec> {
  if (!meta) return {};
  if (meta.cards) return meta.cards;
  const out: Record<string, CardSpec> = {};
  for (const sub of Object.values(meta.subsystems ?? {})) {
    for (const [key, card] of Object.entries(sub.cards ?? {})) {
      out[key] = card;
    }
  }
  return out;
}