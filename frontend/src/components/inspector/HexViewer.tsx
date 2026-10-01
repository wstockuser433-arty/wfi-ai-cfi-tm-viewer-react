import { useMemo } from "react";
import { formatHex } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  rawHex: string;
  bytesPerLine?: number;
  highlightOffset?: number;
  className?: string;
}

export function HexViewer({
  rawHex,
  bytesPerLine = 16,
  highlightOffset,
  className,
}: Props) {
  const lines = useMemo(() => {
    const bytes = new Uint8Array(
      (rawHex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16))
    );
    return formatHex(bytes, bytesPerLine);
  }, [rawHex, bytesPerLine]);

  if (!lines.length) {
    return <div className="text-muted text-xs">no data</div>;
  }

  return (
    <div
      className={cn(
        "mono text-[11px] leading-5 bg-space-950/60 border border-white/5 rounded p-2 overflow-auto",
        className
      )}
    >
      {lines.map((line, i) => {
        const isHighlighted =
          highlightOffset != null &&
          Math.floor(highlightOffset / bytesPerLine) === i;
        return (
          <div
            key={i}
            className={cn(
              "whitespace-pre",
              isHighlighted ? "bg-accent/10 text-accent" : "text-slate-300"
            )}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
}