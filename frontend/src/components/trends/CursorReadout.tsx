interface Props {
  t: number | null;
  values: Record<string, { value: number; unit: string; color: string }>;
}

export function CursorReadout({ t, values }: Props) {
  if (t == null) return null;
  return (
    <div className="absolute top-2 right-2 glass px-3 py-2 text-[11px] pointer-events-none">
      <div className="mono text-accent mb-1">
        {new Date(t * 1000).toLocaleTimeString()}
      </div>
      {Object.entries(values).map(([k, v]) => (
        <div key={k} className="flex items-center gap-2 mono">
          <span className="w-2 h-2 rounded-full" style={{ background: v.color }} />
          <span className="text-muted">{k}</span>
          <span className="text-slate-200">
            {v.value.toFixed(3)} {v.unit}
          </span>
        </div>
      ))}
    </div>
  );
}