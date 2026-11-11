import { create } from "zustand";

export interface PacketSummary {
  id: number;
  ts: string;
  apid: number;
  subsystem: string;
  card: string;
  crc_ok: boolean;
  raw_hex?: string;
}

interface StorageState {
  start: string;
  end: string;
  busy: boolean;
  packets: PacketSummary[];
  msg: string;
  totalInWindow: number;

  setStart: (s: string) => void;
  setEnd: (e: string) => void;
  setBusy: (b: boolean) => void;
  setPackets: (p: PacketSummary[], total: number) => void;
  setMsg: (m: string) => void;
}

// Helper to generate the default date strings
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const useStorageStore = create<StorageState>((set) => ({
  start: toLocalInput(new Date(Date.now() - 3600_000)),
  end: toLocalInput(new Date()),
  busy: false,
  packets: [],
  msg: "",
  totalInWindow: 0,

  setStart: (start) => set({ start }),
  setEnd: (end) => set({ end }),
  setBusy: (busy) => set({ busy }),
  setPackets: (packets, totalInWindow) => set({ packets, totalInWindow }),
  setMsg: (msg) => set({ msg }),
}));