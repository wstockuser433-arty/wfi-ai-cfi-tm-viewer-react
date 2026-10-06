/** Format a timestamp (seconds) as HH:MM:SS.mmm */
export function formatTime(ts: number, opts: { ms?: boolean } = {}): string {
  const d = new Date(ts * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const base = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return opts.ms ? `${base}.${pad(d.getMilliseconds(), 3)}` : base;
}

/** Format a UTC ISO-ish string for logs */
export function formatUtc(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toISOString().replace("T", " ").slice(0, 23);
}

/** Byte-array → "1A 2B 3C" */
export function toHex(bytes: Uint8Array, sep = " "): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(sep);
}

/** "1A2B3C…" → Uint8Array */
export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

/** Human-readable bytes */
export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/** Human-readable duration (seconds) */
export function humanDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  if (seconds < 3600) return `${(seconds / 60).toFixed(1)}min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)}h`;
  return `${(seconds / 86400).toFixed(1)}d`;
}

/** Number with fixed decimals, stripping trailing zeros */
export function fmtNum(v: number | string | null | undefined, decimals = 3): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  if (!Number.isFinite(v)) return "—";
  return Number(v.toFixed(decimals)).toString();
}