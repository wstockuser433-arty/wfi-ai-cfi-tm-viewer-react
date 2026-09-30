import { useState } from "react";
import { Card } from "../ui/card";
import { Button } from "../ui/button";

interface StoredWindow {
  id: string;
  start: string;
  end: string;
  count: number;
  size: string;
}

interface Props {
  windows?: StoredWindow[];
  onSelect?: (id: string) => void;
}

export function WindowList({ windows = [], onSelect }: Props) {
  return (
    <Card>
      <h3 className="text-sm font-semibold mb-3">Stored Windows</h3>
      {windows.length === 0 ? (
        <div className="text-xs text-muted py-8 text-center">
          No stored windows. Query a window and click "Save".
        </div>
      ) : (
        <div className="space-y-1.5">
          {windows.map((w) => (
            <button
              key={w.id}
              onClick={() => onSelect?.(w.id)}
              className="w-full flex items-center justify-between px-3 py-2 rounded text-xs hover:bg-white/5"
            >
              <div className="mono text-left">
                <div>{new Date(w.start).toLocaleString()}</div>
                <div className="text-muted">{new Date(w.end).toLocaleString()}</div>
              </div>
              <div className="text-right">
                <div className="mono">{w.count} pkt</div>
                <div className="text-muted">{w.size}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}