import { useEffect, useRef } from "react";
import { WS_URL, type DecodedPacket } from "@/lib/api";
import { useTelemetry } from "@/store/telemetryStore";

/**
 * Subscribes to the backend TM WebSocket and pushes decoded packets
 * into the Zustand store.
 *
 * Auto-reconnects with a small backoff if the backend goes down.
 */
export function useTelemetryStream(): void {
  const ingest = useTelemetry((s) => s.ingest);
  const setLink = useTelemetry((s) => s.setLink);

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const aliveRef = useRef<boolean>(true);

  useEffect(() => {
    aliveRef.current = true;

    const connect = (): void => {
      if (!aliveRef.current) return;

      setLink("connecting");
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!aliveRef.current) return;
        retryRef.current = 0;
        setLink("connected");
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data) as {
            t: number;
            packets: DecodedPacket[];
          };
          if (Array.isArray(msg.packets) && msg.packets.length > 0) {
            ingest(msg.packets);
          }
        } catch (e) {
          console.error("[ws] bad frame:", e, evt.data);
        }
      };

      ws.onerror = () => {
        // onclose will fire next; nothing to do here
      };

      ws.onclose = () => {
        if (!aliveRef.current) return;
        setLink("disconnected");

        // Exponential backoff capped at 5 s
        const delay = Math.min(500 * 2 ** retryRef.current, 5000);
        retryRef.current += 1;
        timerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      aliveRef.current = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [ingest, setLink]);
}