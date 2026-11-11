import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { API_BASE } from "@/lib/api";
import { useTelemetry } from "@/store/telemetryStore";
import { packetId, type DecodedPacket } from "@/types/packet";

export function UploadDumpButton() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Bring in the store actions
  const ingest = useTelemetry((s) => s.ingest);
  const setSelectedPacketId = useTelemetry((s) => s.setSelectedPacketId);

  async function handle(f: File) {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd });
      const j = await r.json();
      
      // Assuming the backend returns { count: N, packets: DecodedPacket[] }
      // (If it only returns count, we need to adjust the backend — see note below)
      if (j.packets && j.packets.length > 0) {
        const decoded: DecodedPacket[] = j.packets;
        ingest(decoded);
        
        // Auto-select the first packet so the details panel populates
        setSelectedPacketId(packetId(decoded[0]));
      }
      
      setMsg(`${j.count} packets decoded`);
    } catch (e) {
      setMsg(`failed: ${e}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={input}
        type="file"
        accept=".bin,.dump"
        hidden
        onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])}
      />
      <Button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex items-center gap-1.5"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        Upload .bin/.dump
      </Button>
      {msg && <span className="text-[11px] text-muted">{msg}</span>}
    </div>
  );
}