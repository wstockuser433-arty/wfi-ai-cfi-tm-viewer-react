import { PacketListTable } from "@/components/inspector/PacketListTable";
import { PacketDetailsPanel } from "@/components/inspector/PacketDetailsPanel";
import { Card } from "@/components/ui/card";
import { UploadDumpButton } from "@/components/inspector/UploadDumpButton";

export function InspectorPage() {
  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header bar */}
      <Card className="flex items-center justify-between shrink-0">
        <div>
          <div className="text-sm font-semibold">Packet Inspector</div>
          <div className="text-[11px] text-muted">
            Select a packet from the list to inspect its headers, source data, and raw dump
          </div>
        </div>
        <UploadDumpButton />
      </Card>

      {/* Split view: table on left, details on right */}
      <div className="flex-1 min-h-0 grid grid-cols-[400px_1fr] gap-4">
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