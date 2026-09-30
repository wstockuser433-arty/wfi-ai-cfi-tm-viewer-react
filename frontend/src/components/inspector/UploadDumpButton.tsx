import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { API_BASE } from "@/lib/api";

export function UploadDumpButton() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handle(f: File) {
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await fetch(`${API_BASE}/api/upload`, { method: "POST", body: fd });
      const j = await r.json();
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