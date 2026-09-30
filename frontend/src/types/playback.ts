import type { DecodedPacket } from "./packet";

export interface PlaybackWindow {
  start: Date;
  end: Date;
}

export interface PlaybackRequest extends PlaybackWindow {
  speed: number;
  subsystems?: string[];
  apids?: number[];
}

export interface PlaybackStatus {
  playing: boolean;
  speed: number;
  cursor: number; // current ts in seconds
  window: PlaybackWindow | null;
  packetsDelivered: number;
}

export type PlaybackPacketHandler = (p: DecodedPacket) => void;