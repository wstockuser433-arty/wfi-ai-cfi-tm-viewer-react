import { create } from "zustand";

export type Page =
  | "dashboard"   // Live
  | "packets-live" // NEW
  | "trends"
  | "storage"
  | "alarms"
  | "inspector"
  | "playback"
  | "links";

export interface PacketFilter {
  unit_id?: number;
  unit_sub_id?: number;
  service?: number;
  subservice?: number;
  subsystem?: string; // ⭐ Added to help Inspector query history
}

interface UiState {
  mode: "live" | "playback";
  activePage: Page;
  setMode: (m: UiState["mode"]) => void;
  setPage: (p: Page) => void;
  packetFilter: PacketFilter | null;
  setPacketFilter: (filter: PacketFilter | null) => void;
  logsOpen: boolean;
  setLogsOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  mode: "live",
  activePage: "dashboard",
  setMode: (mode) => set({ mode }),
  setPage: (activePage) => set({ activePage }),
  logsOpen: false,
  setLogsOpen: (open) => set({ logsOpen: open }),
  packetFilter: null,
  setPacketFilter: (packetFilter) => set({ packetFilter }),
}));