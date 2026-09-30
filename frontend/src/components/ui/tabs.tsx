import { cn } from "@/lib/utils";
import * as React from "react";

interface TabsProps {
  value: string;
  onValueChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <div className={cn("flex flex-col", className)} data-value={value}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<any>, { value, onValueChange })
          : child
      )}
    </div>
  );
}

export function TabsList({
  value,
  onValueChange,
  children,
  className,
}: {
  value?: string;
  onValueChange?: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 p-0.5 rounded-md bg-white/5 border border-white/10",
        className
      )}
      role="tablist"
    >
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<any>, { activeValue: value, onValueChange })
          : child
      )}
    </div>
  );
}

export function TabsTrigger({
  value: tabValue,
  activeValue,
  onValueChange,
  children,
  className,
}: {
  value: string;
  activeValue?: string;
  onValueChange?: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const active = tabValue === activeValue;
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={() => onValueChange?.(tabValue)}
      className={cn(
        "px-3 py-1 text-xs rounded transition-colors",
        active
          ? "bg-accent-cyan/15 text-accent-cyan"
          : "text-muted hover:text-white hover:bg-white/5",
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value: tabValue,
  activeValue,
  children,
  className,
}: {
  value: string;
  activeValue?: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (tabValue !== activeValue) return null;
  return <div className={cn("mt-3", className)}>{children}</div>;
}