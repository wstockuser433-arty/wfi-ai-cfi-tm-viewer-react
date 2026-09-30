import { useState, useRef, useCallback } from "react";
import { API_BASE } from "@/lib/api";
import { useTelemetry } from "@/store/telemetryStore";

export function usePlayback({ start, end, speed }: { start: Date; end: Date; speed: number }) {
  const [playing, setPlaying] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const ingest = useTelemetry(s => s.ingest);

  const play = useCallback(() => {
    const url = `${API_BASE.replace("http", "ws")}/ws/playback?start=${start.toISOString()}&end=${end.toISOString()}&speed=${speed}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;
    ws.onopen = () => setPlaying(true);
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.packets) ingest(msg.packets);
      if (msg.done) { setPlaying(false); ws.close(); }
    };
    ws.onclose = () => setPlaying(false);
  }, [start, end, speed, ingest]);

  const pause = useCallback(() => {
    wsRef.current?.close();
    setPlaying(false);
  }, []);

  return { play, pause, playing };
}