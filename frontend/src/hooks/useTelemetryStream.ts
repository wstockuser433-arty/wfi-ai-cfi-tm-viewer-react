import { useEffect, useRef } from "react";
import { WS_URL, type DecodedPacket } from "@/lib/api";
import { useTelemetry } from "@/store/telemetryStore";

interface PendingPacket {
  meta: Partial<DecodedPacket>;
  fields: Record<string, any>;
  total_parts: number | null;
  received_parts: number;
}

export function useTelemetryStream(url: string = WS_URL): void {
  // ⚠️ Grab actions via getState() to avoid triggering re-renders
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const aliveRef = useRef<boolean>(true);
  const pendingRef = useRef<Map<string, PendingPacket>>(new Map());

  useEffect(() => {
    aliveRef.current = true;

    const connect = (): void => {
      if (!aliveRef.current) return;

      const store = useTelemetry.getState();
      store.setLink("connecting");

      // const ws = new WebSocket(url);
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/telemetry`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!aliveRef.current) {
          try { ws.close(); } catch {}
          return;
        }
        retryRef.current = 0;
        useTelemetry.getState().setLink("connected");
      };

      ws.onmessage = (evt) => {
        let msg: any;
        try {
          msg = JSON.parse(evt.data);
        } catch (e) {
          console.error("[ws] bad frame:", e, String(evt.data).slice(0, 200));
          return;
        }

        // <--- ADD: Handle session init
        if (msg.type === "init") {
          useTelemetry.getState().setSessionState(
            msg.start_time,
            msg.total_packets,
          );
          return;
        }

        if (msg.type === "packet_begin") {
          pendingRef.current.set(msg.packet_id, {
            meta: msg.packet ?? {},
            fields: {},
            total_parts: null,
            received_parts: 0,
          });
          return;
        }

        if (msg.type === "fields") {
          const buf = pendingRef.current.get(msg.packet_id);
          if (!buf) return;
          Object.assign(buf.fields, msg.fields ?? {});
          buf.received_parts += 1;
          return;
        }

        if (msg.type === "packet_end") {
          const buf = pendingRef.current.get(msg.packet_id);
          if (!buf) return;
          pendingRef.current.delete(msg.packet_id);

          const packet: DecodedPacket = {
            ...(buf.meta as DecodedPacket),
            fields: buf.fields as DecodedPacket["fields"],
            raw_hex: msg.raw_hex ?? "",
            timestamp: msg.t ?? buf.meta.timestamp ?? Date.now() / 1000,
          };
          console.log("PACKET KEYS:", Object.keys(packet.fields).slice(0, 5));
          useTelemetry.getState().ingest([packet]);
          return;
        }

        if (msg.type === "done") {
          useTelemetry.getState().setLink("disconnected");
          return;
        }

        if (Array.isArray(msg.packets) && msg.packets.length > 0) {
          useTelemetry.getState().ingest(msg.packets as DecodedPacket[]);
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        if (!aliveRef.current) return;
        useTelemetry.getState().setLink("disconnected");
        const delay = Math.min(500 * 2 ** retryRef.current, 5000);
        retryRef.current += 1;
        timerRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();
    // console.log("PACKET KEYS:", Object.keys(packet.fields).slice(0, 5));
    return () => {
      aliveRef.current = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const ws = wsRef.current;
      if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        try { ws.close(); } catch {}
      }
      wsRef.current = null;
      pendingRef.current.clear();
    };
  }, [url]); // ⭐ Only depends on `url` — nothing else
}