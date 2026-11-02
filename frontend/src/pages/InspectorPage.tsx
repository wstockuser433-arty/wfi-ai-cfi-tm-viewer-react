import { PacketListTable } from "@/components/inspector/PacketListTable";
import { PacketDecoder } from "@/components/live/PacketDecoder";
import { Card } from "@/components/ui/card";
import { UploadDumpButton } from "@/components/inspector/UploadDumpButton";

export function InspectorPage() {
  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <Card className="flex items-center justify-between shrink-0">
        <div>
          <div className="text-sm font-semibold">Packet Inspector</div>
          <div className="text-[11px] text-muted">
            Hex dump and decoded fields for the latest packet of each APID
          </div>
        </div>
        <UploadDumpButton />
      </Card>

      {/* Paginated Table (takes ~400px, scrolls internally) */}
      <div className="shrink-0 h-[380px]">
        <PacketListTable />
      </div>

      {/* Packet Decoder (fills remaining space) */}
      <div className="flex-1 min-h-[400px]">
        <PacketDecoder />
      </div>
    </div>
  );
}