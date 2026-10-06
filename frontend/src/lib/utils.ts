import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes safely, honoring conditional class objects.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Format bytes as a classic hex dump:
 *   0000  1A 2B 3C 4D 5E 6F 70 71  72 73 74 75 76 77 78 79  .+<M^opqrstuvwx y
 *   0010  ...
 *
 * @param bytes        Input bytes
 * @param bytesPerLine Bytes per row (default 16)
 * @returns Array of formatted lines
 */
export function formatHex(bytes: Uint8Array, bytesPerLine = 16): string[] {
  const lines: string[] = [];

  for (let i = 0; i < bytes.length; i += bytesPerLine) {
    const slice = bytes.slice(i, i + bytesPerLine);

    const hex = Array.from(slice)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join(" ");

    const ascii = Array.from(slice)
      .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
      .join("");

    lines.push(
      `${i.toString(16).padStart(4, "0")}  ${hex.padEnd(bytesPerLine * 3 - 1)}  ${ascii}`
    );
  }

  return lines;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * Format a number with a fixed number of decimals, but strip trailing
 * zeros for cleaner display (e.g. 27.4000 → 27.4).
 */
export function fmt(v: number | string, decimals = 2): string {
  if (typeof v === "string") return v;
  if (!Number.isFinite(v)) return "—";
  return Number(v.toFixed(decimals)).toString();
}