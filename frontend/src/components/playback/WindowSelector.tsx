interface Props {
  start: Date;
  end: Date;
  onChange: (start: Date, end: Date) => void;
}

export function WindowSelector({ start, end, onChange }: Props) {
  return (
    <div className="flex items-center gap-3 text-xs">
      <label className="text-muted">From</label>
      <input
        type="datetime-local"
        value={toLocalInput(start)}
        onChange={(e) => onChange(new Date(e.target.value), end)}
        className="bg-white/5 border border-white/10 rounded px-2 py-1 mono text-[11px]"
      />
      <label className="text-muted">To</label>
      <input
        type="datetime-local"
        value={toLocalInput(end)}
        onChange={(e) => onChange(start, new Date(e.target.value))}
        className="bg-white/5 border border-white/10 rounded px-2 py-1 mono text-[11px]"
      />
    </div>
  );
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}