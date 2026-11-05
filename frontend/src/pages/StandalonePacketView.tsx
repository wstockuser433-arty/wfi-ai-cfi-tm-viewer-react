import { useEffect, useState } from "react";
import { PacketDetailsPanel } from "@/components/inspector/PacketDetailsPanel";
import { Card } from "@/components/ui/card";
import { API_BASE, type DecodedPacket } from "@/lib/api";
import { ArrowLeft } from "lucide-react";
import { useTheme } from "@/hooks/useTheme"; // ⭐ Pull in the theme

export function StandalonePacketView() {
  // ⭐ Apply the theme on mount
  useTheme(); 
  
  const [packet, setPacket] = useState<DecodedPacket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [packetId, setPacketId] = useState<string | null>(null);

  useEffect(() => {
    // URL expected: /standalone/packet/{id}
    const parts = window.location.pathname.split("/");
    const id = parts[parts.length - 1];
    setPacketId(id);

    if (!id || isNaN(Number(id))) {
      setError("No packet ID provided in URL");
      return;
    }

    fetch(`${API_BASE}/api/packets/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setPacket(data))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    // ⭐ Note: use text-primary, bg-space-950 to match the UI theme
    <div className="h-screen flex flex-col bg-space-950 text-primary">
      {/* Title bar */}
      <div className="h-12 flex items-center justify-between px-4 border-b border-white/5 glass-strong shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.close()}
            className="p-1.5 hover:bg-white/5 rounded"
            aria-label="Close window"
            title="Close"
          >
            <ArrowLeft className="w-4 h-4 text-muted" />
          </button>
          <div className="text-sm font-semibold">
            Packet Inspector
          </div>
          {packetId && (
            <span className="mono text-[11px] text-muted">ID #{packetId}</span>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-widest text-muted">
          Standalone View
        </span>
      </div>

      <div className="flex-1 min-h-0 p-4">
        {error && (
          <Card className="text-accent-red p-4 text-sm">
            Failed to load packet #{packetId}: {error}
          </Card>
        )}
        {!error && !packet && (
          <Card className="flex items-center justify-center h-full text-sm text-muted">
            Loading packet #{packetId}…
          </Card>
        )}
        {packet && (
          <div className="max-w-5xl mx-auto h-full">
            <PacketDetailsPanel overridePacket={packet} />
          </div>
        )}
      </div>
    </div>
  );
}