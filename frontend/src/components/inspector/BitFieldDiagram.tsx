interface BitField {
  name: string;
  offset: number; // bits from start
  width: number;  // bits
  value?: number;
}

interface Props {
  fields: BitField[];
  totalBits?: number;
}

export function BitFieldDiagram({ fields, totalBits }: Props) {
  const total = totalBits ?? fields.reduce((m, f) => Math.max(m, f.offset + f.width), 0);

  return (
    <div className="space-y-2">
      <div className="flex h-8 rounded overflow-hidden border border-white/10">
        {fields.map((f) => {
          const pct = (f.width / total) * 100;
          return (
            <div
              key={f.name}
              className="flex items-center justify-center text-[10px] mono border-r border-white/10 last:border-r-0 bg-accent/5"
              style={{ width: `${pct}%` }}
              title={`${f.name}: ${f.width} bits @ offset ${f.offset}`}
            >
              <span className="truncate px-1">{f.name}</span>
            </div>
          );
        })}
      </div>
      <div className="flex text-[10px] mono text-muted">
        {fields.map((f) => (
          <div
            key={f.name}
            style={{ width: `${(f.width / total) * 100}%` }}
            className="text-center truncate"
          >
            {f.width}
          </div>
        ))}
      </div>
    </div>
  );
}