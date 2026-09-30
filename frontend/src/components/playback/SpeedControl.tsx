import { Play, Pause } from "lucide-react";
import { Button } from "../ui/button";

interface Props {
  speed: number;
  setSpeed: (s: number) => void;
  playing: boolean;
  onPlay: () => void;
  onPause: () => void;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8];

export function SpeedControl({ speed, setSpeed, playing, onPlay, onPause }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Button onClick={playing ? onPause : onPlay} className="flex items-center gap-1.5">
        {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        {playing ? "Pause" : "Play"}
      </Button>
      <select
        value={speed}
        onChange={(e) => setSpeed(Number(e.target.value))}
        className="select-dark"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>{s}×</option>
        ))}
      </select>
    </div>
  );
}