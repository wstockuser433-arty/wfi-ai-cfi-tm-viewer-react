import { create } from "zustand";

interface StorageState {
  start: string;
  end: string;
  busy: boolean;
  packets: any[];
  msg: string;
  totalInWindow: number;
  lastQueryKey: string; // ⭐ NEW: remembers the last successful query
  setStart: (s: string) => void;
  setEnd: (s: string) => void;
  setBusy: (b: boolean) => void;
  setPackets: (p: any[], total: number) => void;
  setMsg: (m: string) => void;
  setLastQueryKey: (k: string) => void; // ⭐ NEW
}

export const useStorageStore = create<StorageState>((set) => {
  // Default time range: last 24 hours
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  const toLocalInput = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  return {
    start: toLocalInput(yesterday),
    end: toLocalInput(now),
    busy: false,
    packets: [],
    msg: "",
    totalInWindow: 0,
    lastQueryKey: "", // ⭐ NEW
    setStart: (start) => set({ start }),
    setEnd: (end) => set({ end }),
    setBusy: (busy) => set({ busy }),
    setPackets: (packets, totalInWindow) => set({ packets, totalInWindow }),
    setMsg: (msg) => set({ msg }),
    setLastQueryKey: (lastQueryKey) => set({ lastQueryKey }), // ⭐ NEW
  };
});