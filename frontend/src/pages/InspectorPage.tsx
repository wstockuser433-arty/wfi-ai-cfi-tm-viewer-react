import { PacketListTable } from "@/components/inspector/PacketListTable";
import { PacketDetailsPanel } from "@/components/inspector/PacketDetailsPanel";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadDumpButton } from "@/components/inspector/UploadDumpButton";
import { GitCompare } from "lucide-react";
import { useTelemetry } from "@/store/telemetryStore";
import { cn } from "@/lib/utils";

export function InspectorPage() {
  const diffBaseId = useTelemetry((s) => s.diffBaseId);
  const setDiffBaseId = useTelemetry((s) => s.setDiffBaseId);

  const inCompareMode = diffBaseId !== null;

  return (
    <div className="flex flex-col h-full space-y-4">
      <Card className="flex items-center justify-between shrink-0">
        <div>
          <div className="text-sm font-semibold">Packet Inspector</div>
          <div className="text-[11px] text-muted">
            {inCompareMode
              ? diffBaseId === "PENDING"
                ? "Compare Mode: click a packet to set it as the baseline"
                : "Compare Mode: click a second packet to compare against baseline"
              : "Click a packet to inspect. Right-click to filter."}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setDiffBaseId(diffBaseId ? null : "PENDING")}
            className={cn(
              "flex items-center gap-2 text-xs",
              inCompareMode && "bg-accent/20 border-accent/30 text-accent"
            )}
          >
            <GitCompare className="w-4 h-4" />
            {inCompareMode ? "Cancel Compare" : "Compare Mode"}
          </Button>
          <UploadDumpButton />
        </div>
      </Card>

      <div className="flex-1 min-h-0 grid grid-cols-[minmax(420px,35%)_1fr] gap-4">
        <div className="min-h-0">
          <PacketListTable />
        </div>
        <div className="min-h-0">
          <PacketDetailsPanel />
        </div>
      </div>
    </div>
  );
}