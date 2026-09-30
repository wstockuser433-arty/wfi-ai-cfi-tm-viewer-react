import { create } from "zustand";
import type { DecodedPacket } from "@/types/packet";
import type { MetaResponse } from "@/types/meta";

// ---------------------------------------------------------------------- //
// Types
// ---------------------------------------------------------------------- //
export type LinkState = "connected" | "connecting" | "disconnected";

export interface Alarm {
  id: string;
  ts: number;
  severity: "WARN" | "CRIT";
  subsystem: string;
  card: string;
  apid: number;
  param: string;
  message: string;
}

interface TelemetryState {
  // ---- Live packet buffer (bounded ring) ------------------------------
  packets: DecodedPacket[];

  // ---- Latest-by-index maps for O(1) reads ----------------------------
  latestByApid: Record<number, DecodedPacket>;
  latestByParam: Record<string, DecodedPacket>; // key: `${apid}:${param}`

  // ---- Alarm buffer ---------------------------------------------------
  alarms: Alarm[];

  // ---- Connection / stats --------------------------------------------
  link: LinkState;
  lastPacketAt: number;
  totalReceived: number;

  // ---- TM dictionary (from /api/meta) --------------------------------
  meta: MetaResponse | null;

  // ---- Actions -------------------------------------------------------
  ingest: (batch: DecodedPacket[]) => void;
  setLink: (s: LinkState) => void;
  setMeta: (m: MetaResponse) => void;
  clearAlarms: () => void;
  reset: () => void;
}

// ---------------------------------------------------------------------- //
// Constants
// ---------------------------------------------------------------------- //
const MAX_PACKETS = 1000;
const MAX_ALARMS = 100;

// ---------------------------------------------------------------------- //
// Store
// ---------------------------------------------------------------------- //
export const useTelemetry = create<TelemetryState>((set) => ({
  packets: [],
  latestByApid: {},
  latestByParam: {},
  alarms: [],
  link: "disconnected",
  lastPacketAt: 0,
  totalReceived: 0,
  meta: null,

  // ------------------------------------------------------------------ //
  ingest: (batch) =>
    set((state) => {
      if (!batch || batch.length === 0) return state;

      const latest = { ...state.latestByApid };
      const latestParam = { ...state.latestByParam };
      const newAlarms: Alarm[] = [];

      // Track seen alarm keys in this batch to avoid duplicates within
      // the same tick (a param that appears twice in one batch)
      const seenKeys = new Set<string>();

      for (const p of batch) {
        latest[p.apid] = p;

        for (const [name, f] of Object.entries(p.fields ?? {})) {
          latestParam[`${p.apid}:${name}`] = p;

          if (f.status !== "OK") {
            const id = `${p.apid}:${name}:${f.status}`;
            if (seenKeys.has(id)) continue;
            seenKeys.add(id);

            // Skip if identical alarm already present (deduplicated)
            const existing = state.alarms.find((a) => a.id === id);
            if (existing) continue;

            newAlarms.push({
              id,
              ts: p.timestamp,
              severity: f.status === "CRIT" ? "CRIT" : "WARN",
              subsystem: p.subsystem,
              card: p.card,
              apid: p.apid,
              param: name,
              message:
                `${p.subsystem}/${p.card}.${name} = ` +
                `${f.value}${f.unit ?? ""} ` +
                `(limits ${f.limits?.[0] ?? "—"}–${f.limits?.[1] ?? "—"})`,
            });
          }
        }
      }

      return {
        packets: [...state.packets, ...batch].slice(-MAX_PACKETS),
        latestByApid: latest,
        latestByParam: latestParam,
        alarms: [...state.alarms, ...newAlarms].slice(-MAX_ALARMS),
        lastPacketAt: Date.now(),
        totalReceived: state.totalReceived + batch.length,
      };
    }),

  // ------------------------------------------------------------------ //
  setLink: (link) => set({ link }),

  setMeta: (meta) => set({ meta }),

  clearAlarms: () => set({ alarms: [] }),

  reset: () =>
    set({
      packets: [],
      latestByApid: {},
      latestByParam: {},
      alarms: [],
      lastPacketAt: 0,
      totalReceived: 0,
    }),
}));