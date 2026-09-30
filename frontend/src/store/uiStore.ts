import { create } from "zustand";

export type Page =
  | "dashboard"   // Live
  | "trends"
  | "storage"
  | "alarms"
  | "inspector"
  | "playback"
  | "links";

interface UiState {
  mode: "live" | "playback";
  activePage: Page;
  setMode: (m: UiState["mode"]) => void;
  setPage: (p: Page) => void;
}

export const useUiStore = create<UiState>((set) => ({
  mode: "live",
  activePage: "dashboard",
  setMode: (mode) => set({ mode }),
  setPage: (activePage) => set({ activePage }),
}));