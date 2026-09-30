import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { API_BASE } from "@/lib/api";

interface Props {
  start: Date;
  end: Date;
  format?: "csv" | "json";
}

export function ExportButton({ start, end, format = "csv" }: Props) {
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const r = await fetch(
        `${API_BASE}/api/history?start=${start.toISOString()}&end=${end.toISOString()}&limit=50000`
      );
      const j = await r.json();
      const packets: any[] = j.packets ?? [];

      if (format === "json") {
        download(JSON.stringify(packets, null, 2), "tm-export.json", "application/json");
      } else {
        const rows = [
          ["ts", "apid", "subsystem", "card", "crc_ok"],
          ...packets.map((p) => [p.ts, p.apid, p.subsystem, p.card, p.crc_ok]),
        ];
        download(rows.map((r) => r.join(",")).join("\n"), "tm-export.csv", "text/csv");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={run} disabled={busy} className="flex items-center gap-1.5">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      {busy ? "Exporting…" : `Export ${format.toUpperCase()}`}
    </Button>
  );
}

function download(content: string, name: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}