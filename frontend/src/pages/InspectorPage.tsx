import { PacketDecoder } from "@/components/live/PacketDecoder";
import { FilterBar } from "@/components/inspector/FilterBar";
import { UploadDumpButton } from "@/components/inspector/UploadDumpButton";
import { Card } from "@/components/ui/card";

export function InspectorPage() {
  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between">
        <FilterBar />
        <UploadDumpButton />
      </Card>
      <PacketDecoder />
    </div>
  );
}