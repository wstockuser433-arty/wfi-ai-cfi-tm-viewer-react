import { create } from "zustand";

export type Page =
  | "dashboard"
  | "inspector"
  | "trends"
  | "storage"
  | "playback"
  | "links"
  | "alarms";

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