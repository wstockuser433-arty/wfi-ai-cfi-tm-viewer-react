export interface ChartTokens {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
}

export function chartTokens(isDark: boolean): ChartTokens {
  return isDark
    ? {
        grid: "#ffffff08",
        axis: "#8B95A9",
        tooltipBg: "#141925",
        tooltipBorder: "rgba(255,255,255,0.08)",
        tooltipText: "#E6EDF7",
      }
    : {
        grid: "#E2E8F0",
        axis: "#64748B",
        tooltipBg: "#FFFFFF",
        tooltipBorder: "#E2E8F0",
        tooltipText: "#0F172A",
      };
}