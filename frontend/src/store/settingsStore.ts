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
  // ─── runtime status from the backend ───
  status: "idle" | "open" | "error";
  last_error: string | null;
  last_error_at: number | null;
}

export interface SettingsState {
  // Theme (existing)
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;

  // API endpoints (existing — kept so nothing downstream breaks)
  api: ApiConfig;
  setApi: (api: Partial<ApiConfig>) => void;

  // Serial / transport
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

const DEFAULT_SERIAL: SerialConfig = {
  transport: "ethernet",
  port: "/tmp/ttyV1",
  baudrate: 115200,
  bytesize: 8,
  parity: "N",
  stopbits: 1,
  flow_control: "none",
  timeout_s: 0.1,
  read_chunk: 4096,
  // Runtime status — initialized to idle; overwritten by fetchSerial()
  status: "idle",
  last_error: null,
  last_error_at: null,
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

      // ─── Serial / transport ─────────────────────────────────
      serial: DEFAULT_SERIAL,
      serialSaving: false,
      serialError: null,

      fetchSerial: async () => {
        try {
          const r = await fetch(`${API_BASE}/api/settings/serial`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = (await r.json()) as SerialConfig;

          // Backfill status fields if the backend doesn't send them yet
          const merged: SerialConfig = {
            ...DEFAULT_SERIAL,
            ...data,
            status: data.status ?? "idle",
            last_error: data.last_error ?? null,
            last_error_at: data.last_error_at ?? null,
          };

          set({ serial: merged, serialError: null });
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

          // 3. Re-fetch shortly after to pick up any status change
          //    (e.g. if the port failed to open, status → "error")
          setTimeout(() => {
            void get().fetchSerial();
          }, 1000);
        } catch (e) {
          // 4. On error, roll back to the previous state
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
          serial: DEFAULT_SERIAL,
          serialSaving: false,
          serialError: null,
        }),
    }),
    {
      name: "tm-viewer-settings",
      version: 3,   // bumped to 3 — previous data lacked status fields
      partialize: (state) => ({
        theme: state.theme,
        api: state.api,
        // Don't persist `serial` — the backend is the source of truth
      }),
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          return {
            theme: persisted?.theme ?? "dark",
            api: persisted?.api ?? DEFAULT_API,
          };
        }
        if (version < 3) {
          // v2 stored serial without status fields — clear it so the
          // app re-fetches from the backend
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