import { create } from "zustand";
import { persist } from "zustand/middleware";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────

export type ThemeMode = "light" | "dark" | "system";
export type Transport = "ethernet" | "serial";

export interface ApiConfig {
  apiBase: string;
  wsUrl: string;
}

export interface SerialConfig {
  transport: Transport;
  port: string;
  baudrate: number;
  bytesize: number;
  parity: "N" | "E" | "O" | "M" | "S";
  stopbits: number;
  flow_control: "none" | "rtscts" | "xonxoff" | "dsrdtr";
  timeout_s: number;
  read_chunk: number;
}

export interface SettingsState {
  // Theme (existing)
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;

  // API endpoints (existing — kept so nothing downstream breaks)
  api: ApiConfig;
  setApi: (api: Partial<ApiConfig>) => void;

  // Serial / transport (new)
  serial: SerialConfig | null;
  serialSaving: boolean;
  serialError: string | null;
  fetchSerial: () => Promise<void>;
  updateSerial: (patch: Partial<SerialConfig>) => Promise<void>;

  // Reset (existing)
  reset: () => void;
}

// ─── Defaults ────────────────────────────────────────────────────────────

const DEFAULT_API: ApiConfig = {
  apiBase: "http://localhost:8000",
  wsUrl: "ws://localhost:8000/ws/telemetry",
};

// ─── Store ───────────────────────────────────────────────────────────────

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      // ─── Theme ──────────────────────────────────────────────
      theme: "dark",
      setTheme: (theme) => set({ theme }),

      // ─── API endpoints (existing) ───────────────────────────
      api: DEFAULT_API,
      setApi: (patch) => set((s) => ({ api: { ...s.api, ...patch } })),

      // ─── Serial / transport (new) ───────────────────────────
            // ─── Serial / transport (new) ───────────────────────────
      serial: {
        transport: "ethernet",
        port: "/dev/ttyUSB0",
        baudrate: 115200,
        bytesize: 8,
        parity: "N",
        stopbits: 1,
        flow_control: "none",
        timeout_s: 0.1,
        read_chunk: 4096,
      },
      serialSaving: false,
      serialError: null,

      fetchSerial: async () => {
        try {
          const r = await fetch(`${API_BASE}/api/settings/serial`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = (await r.json()) as SerialConfig;
          set({ serial: data, serialError: null });
        } catch (e) {
          set({ serialError: String(e) });
        }
      },

      updateSerial: async (patch) => {
        const current = get().serial;
        if (!current) return;

        const merged = { ...current, ...patch };

        // 1. Optimistic UI update — reflect the click instantly
        set({ serial: merged, serialSaving: true, serialError: null });

        try {
          const r = await fetch(`${API_BASE}/api/settings/serial`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(merged),
          });

          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(body.detail ?? `HTTP ${r.status}`);
          }

          // 2. Overwrite with the canonical saved config
          const saved = (await r.json()) as SerialConfig;
          set({ serial: saved, serialSaving: false });
        } catch (e) {
          // 3. On error, roll back to the previous state
          set({
            serial: current,
            serialSaving: false,
            serialError: String(e),
          });
        }
      },

      // ─── Reset ──────────────────────────────────────────────
      reset: () =>
        set({
          theme: "dark",
          api: DEFAULT_API,
          serial: null,
          serialSaving: false,
          serialError: null,
        }),
    }),
    {
      name: "tm-viewer-settings",
      version: 2,             // bumped from 1 → 2 because we added fields
      // Only persist the user-facing settings — not runtime flags
      partialize: (state) => ({
        theme: state.theme,
        api: state.api,
      }),
      // Migrate from v1 → v2 cleanly
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          // v1 had theme + api only. Preserve them; serial starts null.
          return {
            theme: persisted?.theme ?? "dark",
            api: persisted?.api ?? DEFAULT_API,
          };
        }
        return persisted;
      },
    }
  )
);