import { KpiCards } from "@/components/live/KpiCards";
import { LiveChart } from "@/components/live/LiveChart";
import { PacketDecoder } from "@/components/live/PacketDecoder";
import { AlarmRail } from "@/components/live/AlarmRail";
import { LinkHealthStrip } from "@/components/live/LinkHealthStrip";

export function LivePage() {
  return (
    <div className="space-y-4">
      <LinkHealthStrip />
      <KpiCards />
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2"><LiveChart /></div>
        <AlarmRail />
      </div>
      <PacketDecoder />
    </div>
  );
}