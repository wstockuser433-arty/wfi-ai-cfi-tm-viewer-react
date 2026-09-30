import { cn } from "@/lib/utils";
import * as React from "react";

export const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
        "bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200",
        "disabled:opacity-50 disabled:pointer-events-none",
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";