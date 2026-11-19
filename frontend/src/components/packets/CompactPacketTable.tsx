import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";

export type PacketLike = {
  id?: number;
  timestamp?: number;
  ts?: string;
  apid: number;
  subsystem?: string;
  card?: string;
  crc_ok?: boolean;
  seq?: number;
  service_type?: number | null;
  service_subtype?: number | null;
  raw_hex?: string;
};

type Props = {
  packets: PacketLike[];
  onInspect: (p: PacketLike) => void;
  pageSize?: number;
  emptyMessage?: string;
  loading?: boolean;
};

function toMs(p: PacketLike): number {
  if (typeof p.timestamp === "number") return p.timestamp * 1000;
  if (p.ts) return new Date(p.ts).getTime();
  return 0;
}
function fmtTime(ms: number): string {
  if (!ms) return "—";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds()).padStart(3, "0")}`;
}
function hex(v?: number | null) {
  return v === undefined || v === null ? "—" : "0x" + v.toString(16).toUpperCase();
}

export function CompactPacketTable({
  packets,
  onInspect,
  pageSize = 50,
  emptyMessage = "No packets",
  loading = false,
}: Props) {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(pageSize);

  const sorted = useMemo(
    () => [...packets].sort((a, b) => toMs(b) - toMs(a)),
    [packets]
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / size));
  const start = page * size;
  const rows = sorted.slice(start, start + size);

  return (
    <div className="flex flex-col border border-white/10 rounded-md bg-space-900/40">
      <div className="overflow-x-auto max-h-[600px]">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-space-800 text-[11px] text-muted uppercase tracking-wider">
            <tr className="border-b border-white/5">
              <th className="text-left py-2 px-3">Time</th>
              <th className="text-left py-2 px-3">APID</th>
              {/* <th className="text-left py-2 px-3">Subsystem</th> */}
              {/* <th className="text-left py-2 px-3">Card</th> */}
              <th className="text-left py-2 px-3">Seq</th>
              <th className="text-left py-2 px-3">Svc/Sub</th>
              <th className="text-left py-2 px-3">Card</th>
              <th className="text-left py-2 px-3">CRC</th>
              <th className="text-left py-2 px-3">Data</th>
              <th className="text-right py-2 px-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-4 text-center text-muted">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((p, i) => (
                <tr
                  key={p.id ?? `${toMs(p)}-${start + i}`}
                  className="border-b border-white/5 hover:bg-white/5"
                >
                  <td className="mono py-1.5 px-3 text-muted whitespace-nowrap">
                    {fmtTime(toMs(p))}
                  </td>
                  <td className="mono py-1.5 px-3">
                    {hex(p.apid)}
                  </td>
                  {/* <td className="py-1.5 px-3">{p.subsystem ?? "—"}</td> */}
                  {/* <td className="py-1.5 px-3 text-muted">{p.card ?? "—"}</td> */}
                  <td className="mono py-1.5 px-3">{p.seq ?? "—"}</td>
                  <td className="mono py-1.5 px-3 whitespace-nowrap">
                    {p.service_type != null
                      ? `0x${p.service_type.toString(16).toUpperCase()}/0x${(p.service_subtype ?? 0).toString(16).toUpperCase()}`
                      : "—"}
                  </td>
                  <td className="py-1.5 px-3 text-slate-200">{p.card}</td>
                  <td className="py-1.5 px-3">
                    {p.crc_ok === undefined ? (
                      "—"
                    ) : p.crc_ok ? (
                      <span className="text-emerald-400">OK</span>
                    ) : (
                      <span className="text-rose-400">FAIL</span>
                    )}
                  </td>
                  <td className="mono py-1.5 px-3 text-muted truncate max-w-[260px]">
                    {p.raw_hex
                      ? p.raw_hex.slice(0, 40) + (p.raw_hex.length > 40 ? "…" : "")
                      : "—"}
                  </td>
                  <td className="py-1.5 px-3 text-right">
                    <button
                      onClick={() => onInspect(p)}
                      className="text-accent hover:underline inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Inspect
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-3 py-2 border-t border-white/10 bg-space-900/60 text-xs text-muted">
        <span>
          {sorted.length === 0
            ? "0"
            : `${start + 1}–${Math.min(start + size, sorted.length)} of ${sorted.length}`}
        </span>
        <div className="flex items-center gap-2">
          <select
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(0);
            }}
            className="bg-white/5 border border-white/10 rounded px-1 py-0.5 text-xs"
          >
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="px-2 py-0.5 border border-white/10 rounded disabled:opacity-40"
          >
            Prev
          </button>
          <span>
            {page + 1} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="px-2 py-0.5 border border-white/10 rounded disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}