// ─── Dark theme palette ────────────────────────────────────────────
export const SUBSYSTEM_COLORS: Record<string, string> = {
  CAMERA: "#8494DA",   // ⭐ was #00E5FF — now periwinkle
  CDPM_P: "#22C55E",
  CDPM_R: "#16A34A",
  CTPU_P: "#FFB020",
  CTPU_R: "#F59E0B",
  UNIT:   "#8B95A9",
  LINKS:  "#A855F7",
};

// ─── Light theme palette ───────────────────────────────────────────
export const SUBSYSTEM_COLORS_LIGHT: Record<string, string> = {
  CAMERA: "#4B5FB4",   // ⭐ was #0284C7 — now periwinkle
  CDPM_P: "#15803D",
  CDPM_R: "#166534",
  CTPU_P: "#B45309",
  CTPU_R: "#92400E",
  UNIT:   "#475569",
  LINKS:  "#7E22CE",
};

export function subsystemColor(key: string, isDark: boolean): string {
  const palette = isDark ? SUBSYSTEM_COLORS : SUBSYSTEM_COLORS_LIGHT;
  return palette[key] ?? (isDark ? "#8B95A9" : "#64748B");
}

export const STATUS_COLORS: Record<string, string> = {
  OK:   "#22C55E",
  WARN: "#FFB020",
  CRIT: "#FF4D5E",
};

export const STATUS_COLORS_LIGHT: Record<string, string> = {
  OK:   "#15803D",
  WARN: "#B45309",
  CRIT: "#B91C1C",
};

export function statusColor(status: string, isDark: boolean): string {
  const palette = isDark ? STATUS_COLORS : STATUS_COLORS_LIGHT;
  return palette[status] ?? (isDark ? "#8B95A9" : "#64748B");
}