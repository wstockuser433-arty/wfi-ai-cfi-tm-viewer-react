import { PacketDecoder } from "@/components/live/PacketDecoder";
import { Card } from "@/components/ui/card";
import { UploadDumpButton } from "@/components/inspector/UploadDumpButton";

export function InspectorPage() {
  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Packet Inspector</div>
          <div className="text-[11px] text-muted">
            Hex dump and decoded fields for the latest packet of each APID
          </div>
        </div>
        <UploadDumpButton />
      </Card>
      <PacketDecoder />
    </div>
  );
}