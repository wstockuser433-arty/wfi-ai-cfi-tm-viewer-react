import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

export interface ApiConfig {
  apiBase: string;
  wsUrl: string;
}

export interface SettingsState {
  theme: ThemeMode;
  api: ApiConfig;

  setTheme: (theme: ThemeMode) => void;
  setApi: (api: Partial<ApiConfig>) => void;
  reset: () => void;
}

// Sensible defaults — match the current hard-coded values
const DEFAULT_API: ApiConfig = {
  apiBase: "http://localhost:8000",
  wsUrl: "ws://localhost:8000/ws/telemetry",
};

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      api: DEFAULT_API,

      setTheme: (theme) => set({ theme }),
      setApi: (api) => set((s) => ({ api: { ...s.api, ...api } })),
      reset: () => set({ theme: "dark", api: DEFAULT_API }),
    }),
    {
      name: "tm-viewer-settings",  // localStorage key
      version: 1,
    }
  )
);