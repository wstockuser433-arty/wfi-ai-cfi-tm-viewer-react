import { cn } from "@/lib/utils";
import * as React from "react";

type Variant = "ok" | "warn" | "crit" | "muted" | "cyan";

const VARIANTS: Record<Variant, string> = {
  ok: "bg-accent-green/10 text-accent-green border-accent-green/30",
  warn: "bg-accent-amber/10 text-accent-amber border-accent-amber/30",
  crit: "bg-accent-red/10 text-accent-red border-accent-red/30",
  cyan: "bg-accent/10 text-accent border-accent/30",
  muted: "bg-white/5 text-muted border-white/10",
};

export function Badge({
  variant = "muted",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-medium border",
        VARIANTS[variant],
        className
      )}
      {...props}
    />
  );
}