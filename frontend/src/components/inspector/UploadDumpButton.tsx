import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/api";
import { useTelemetry } from "@/store/telemetryStore";
import type { DecodedPacket } from "@/types/packet";

interface Props {
  onUpload?: (packets: DecodedPacket[]) => void;
}

export function UploadDumpButton({ onUpload }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null); // ⭐ Added
  const ingest = useTelemetry((s) => s.ingest);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setBusy(true);
    setErrorMsg(null); // ⭐ Now defined
    setCount(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      // Backend returns {count, packets}, not a bare array
      const response = await res.json();
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      const decoded: DecodedPacket[] = response.packets ?? [];
      
      if (decoded.length === 0) {
         throw new Error("Backend returned 0 packets. Check the JSON format.");
      }
      
      // 1. Update global store (so Details Panel can read it)
      ingest(decoded, false);
      
      // 2. Update local count
      setCount(decoded.length);
      
      // 3. Update parent component
      if (onUpload) {
        onUpload(decoded); 
      }
      
    } catch (err: any) {
      console.error("Upload failed", err);
      setErrorMsg(err.message || "Upload failed"); // ⭐ Now defined
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      {count !== null && (
        <span className="text-[11px] text-accent-green mono">
          {count} packets decoded
        </span>
      )}
      {errorMsg && (
        <span className="text-[11px] text-accent-red mono" title={errorMsg}>
          Error: {errorMsg}
        </span>
      )}
      <input
        type="file"
        accept=".json,.bin"
        ref={fileRef}
        onChange={handleFile}
        className="hidden"
      />
      <Button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="flex items-center gap-1.5"
      >
        <Upload className="w-4 h-4" />
        {busy ? "Uploading…" : "Upload Dump"}
      </Button>
    </div>
  );
}