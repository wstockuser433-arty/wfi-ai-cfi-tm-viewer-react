import { useEffect, useState } from "react";
import { PacketDetailsPanel } from "@/components/inspector/PacketDetailsPanel";
import { Card } from "@/components/ui/card";
import { API_BASE, type DecodedPacket } from "@/lib/api";
import { ArrowLeft } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

export function StandalonePacketView() {
  useTheme(); 
  
  const [packet, setPacket] = useState<DecodedPacket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [packetId, setPacketId] = useState<string | null>(null);

  useEffect(() => {
    const parts = window.location.pathname.split("/");
    const id = parts[parts.length - 1];
    setPacketId(id);

    if (!id) {
      setError("No packet ID provided in URL");
      return;
    }

    // Check if it's an integer (Storage) or string (Bookmark)
    const isNumeric = /^\d+$/.test(id);
    let fetchUrl = "";

    if (isNumeric) {
      fetchUrl = `${API_BASE}/api/packets/${id}`;
    } else {
      const idParts = id.split("-");
      if (idParts.length !== 3) {
        setError(`Invalid packet ID format: "${id}"`);
        return;
      }
      const [ts, apid, seq] = idParts;
      fetchUrl = `${API_BASE}/api/packets/by-key?apid=${apid}&seq=${seq}&ts=${ts}`;
    }

    fetch(fetchUrl)
      .then((r) => {
        if (r.status === 404) throw new Error("Packet not found in database");
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setPacket(data))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div className="h-screen flex flex-col bg-space-950 text-primary">
      <div className="h-12 flex items-center justify-between px-4 border-b border-white/5 glass-strong shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.close()}
            className="p-1.5 hover:bg-white/5 rounded"
            aria-label="Close window"
          >
            <ArrowLeft className="w-4 h-4 text-muted" />
          </button>
          <div className="text-sm font-semibold">
            Packet Inspector
          </div>
          
          {/* ⭐ FIX: Read APID and Seq directly from the decoded packet object */}
          {packet && (
            <span className="mono text-[11px] text-muted flex items-center gap-2">
              <span>APID 0x{packet.apid.toString(16).toUpperCase()}</span>
              <span>·</span>
              <span>Seq {packet.seq}</span>
            </span>
          )}
          
          {/* Fallback if packet isn't loaded yet */}
          {!packet && packetId && (
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
            Failed to load packet: {error}
          </Card>
        )}
        {!error && !packet && (
          <Card className="flex items-center justify-center h-full text-sm text-muted">
            Loading packet…
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