// ─── Dark theme palette ────────────────────────────────────────────
export const SUBSYSTEM_COLORS: Record<string, string> = {
  CAMERA: "#8494DA",       // Periwinkle
  EBOX: "#8B95A9",         // Gray
  CTPU: "#FFB020",         // Orange
  CDPM_P: "#22C55E",       // Green
  CDPM_R_AI: "#16A34A",    // Darker Green
  CDPM_R_FPGA: "#F59E0B",  // Amber
};

// ─── Light theme palette ───────────────────────────────────────────
export const SUBSYSTEM_COLORS_LIGHT: Record<string, string> = {
  CAMERA: "#4B5FB4",
  EBOX: "#475569",
  CTPU: "#B45309",
  CDPM_P: "#15803D",
  CDPM_R_AI: "#166534",
  CDPM_R_FPGA: "#92400E",
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