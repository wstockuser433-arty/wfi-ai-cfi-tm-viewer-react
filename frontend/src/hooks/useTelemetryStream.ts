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
  const ingest = useTelemetry((s) => s.ingest);
  const setLink = useTelemetry((s) => s.setLink);

  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const aliveRef = useRef<boolean>(true);

  // Reassembly buffer: packet_id → PendingPacket
  const pendingRef = useRef<Map<string, PendingPacket>>(new Map());

  useEffect(() => {
    aliveRef.current = true;

    const connect = (): void => {
      if (!aliveRef.current) return;

      setLink("connecting");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!aliveRef.current) {
          try { ws.close(); } catch {}
          return;
        }
        retryRef.current = 0;
        setLink("connected");
      };

      ws.onmessage = (evt) => {
        let msg: any;
        try {
          msg = JSON.parse(evt.data);
        } catch (e) {
          console.error("[ws] bad frame:", e, String(evt.data).slice(0, 200));
          return;
        }

        // ─── Reassembly protocol ────────────────────────────────
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
          if (!buf) {
            console.warn("[ws] fields for unknown packet:", msg.packet_id);
            return;
          }
          Object.assign(buf.fields, msg.fields ?? {});
          buf.received_parts += 1;
          return;
        }

        if (msg.type === "packet_end") {
          const buf = pendingRef.current.get(msg.packet_id);
          if (!buf) {
            console.warn("[ws] end for unknown packet:", msg.packet_id);
            return;
          }
          pendingRef.current.delete(msg.packet_id);

          // Assemble the final DecodedPacket
          const packet: DecodedPacket = {
            ...(buf.meta as DecodedPacket),
            fields: buf.fields as DecodedPacket["fields"],
            raw_hex: msg.raw_hex ?? "",
            timestamp: msg.t ?? buf.meta.timestamp ?? Date.now() / 1000,
          };

          ingest([packet]);
          return;
        }

        if (msg.type === "done") {
          setLink("disconnected");
          return;
        }

        // ─── Legacy single-frame protocol (fallback) ────────────
        if (Array.isArray(msg.packets) && msg.packets.length > 0) {
          ingest(msg.packets as DecodedPacket[]);
        }

        // Ensure buf exists in your component/module scope
        let buf = null; 

        // Inside your message handler:
        if (msg.type === "packet_begin") {
          buf = { packet_id: msg.packet_id, fields: {} };
          console.log(`[ws] begin ${msg.packet_id} | ${msg.packet.subsystem}/${msg.packet.card}`);
        }

        if (msg.type === "packet_end") {
          console.log(`[ws] end   ${msg.packet_id} | ${msg.total_parts} parts | ${Object.keys(buf?.fields ?? {}).length} fields`);
        }
      };

      ws.onerror = () => {};

      ws.onclose = () => {
        if (!aliveRef.current) return;
        setLink("disconnected");
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
      const ws = wsRef.current;
      if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        try { ws.close(); } catch {}
      }
      wsRef.current = null;
      pendingRef.current.clear();
    };
  }, [url, ingest, setLink]);
}