import { useState } from "react";
import { TimelineScrubber } from "@/components/playback/TimelineScrubber";
import { SpeedControl } from "@/components/playback/SpeedControl";
import { Card } from "@/components/ui/card";
import { LiveChart } from "@/components/live/LiveChart";
import { PacketDecoder } from "@/components/live/PacketDecoder";
import { usePlayback } from "@/hooks/usePlayback";

export function PlaybackPage() {
  const [start, setStart] = useState<Date>(new Date(Date.now() - 3600_000));
  const [end, setEnd] = useState<Date>(new Date());
  const [speed, setSpeed] = useState(1);
  const { play, pause, playing } = usePlayback({ start, end, speed });

  return (
    <div className="space-y-4">
      <Card className="flex items-center justify-between gap-4">
        <TimelineScrubber start={start} end={end} onChange={(s: Date, e: Date) => { setStart(s); setEnd(e); }} />
        <SpeedControl speed={speed} setSpeed={setSpeed} playing={playing} onPlay={play} onPause={pause} />
      </Card>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2"><LiveChart /></div>
        <PacketDecoder />
      </div>
    </div>
  );
}