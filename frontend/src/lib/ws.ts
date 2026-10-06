import type { DecodedPacket } from "./api";

export interface WsClientOptions {
  url: string;
  onPacket: (batch: DecodedPacket[]) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (e: Event) => void;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

/**
 * Reconnecting WebSocket client.
 * Auto-retries with exponential backoff. Call .close() to stop permanently.
 */
export class WsClient {
  private ws: WebSocket | null = null;
  private retries = 0;
  private timer: number | null = null;
  private closed = false;

  constructor(private opts: WsClientOptions) {}

  connect(): void {
    if (this.closed) return;

    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this.opts.onOpen?.();
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data) as { packets?: DecodedPacket[] };
        if (Array.isArray(msg.packets)) this.opts.onPacket(msg.packets);
      } catch (e) {
        console.error("[ws] bad frame:", e);
      }
    };

    ws.onerror = (e) => this.opts.onError?.(e);

    ws.onclose = () => {
      this.opts.onClose?.();
      if (this.closed) return;

      const max = this.opts.maxRetries ?? Infinity;
      if (this.retries >= max) return;

      const base = this.opts.baseDelayMs ?? 500;
      const cap = this.opts.maxDelayMs ?? 5000;
      const delay = Math.min(base * 2 ** this.retries, cap);
      this.retries++;
      this.timer = window.setTimeout(() => this.connect(), delay);
    };
  }

  close(): void {
    this.closed = true;
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}