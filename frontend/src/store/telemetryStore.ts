import { create } from "zustand";
import type { DecodedPacket } from "@/types/packet";
import type { MetaResponse } from "@/types/meta";

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
  packets: DecodedPacket[];
  latestByApid: Record<number, DecodedPacket>;
  latestByParam: Record<string, DecodedPacket>;
  alarms: Alarm[];
  link: LinkState;
  lastPacketAt: number;
  totalReceived: number;
  meta: MetaResponse | null;

  ingest: (batch: DecodedPacket[]) => void;
  setLink: (s: LinkState) => void;
  setMeta: (m: MetaResponse) => void;
  clearAlarms: () => void;
  reset: () => void;
}

const MAX_PACKETS = 1000;
const MAX_ALARMS = 100;

export const useTelemetry = create<TelemetryState>((set) => ({
  packets: [],
  latestByApid: {},
  latestByParam: {},
  alarms: [],
  link: "disconnected",
  lastPacketAt: 0,
  totalReceived: 0,
  meta: null,

  ingest: (batch) =>
    set((state) => {
      if (!batch || batch.length === 0) {
        // ⚠️ Return the SAME state object reference — no re-render.
        return state;
      }

      const latest = { ...state.latestByApid };
      const latestParam = { ...state.latestByParam };
      const newAlarms: Alarm[] = [];
      const seenKeys = new Set<string>();

      for (const p of batch) {
        latest[p.apid] = p;
        for (const [name, f] of Object.entries(p.fields ?? {})) {
          latestParam[`${p.apid}:${name}`] = p;
          if (f.status !== "OK") {
            const id = `${p.apid}:${name}:${f.status}`;
            if (seenKeys.has(id)) continue;
            seenKeys.add(id);
            if (state.alarms.find((a) => a.id === id)) continue;
            newAlarms.push({
              id,
              ts: p.timestamp,
              severity: f.status === "CRIT" ? "CRIT" : "WARN",
              subsystem: p.subsystem,
              card: p.card,
              apid: p.apid,
              param: name,
              message:
                `${p.subsystem}/${p.card}.${name} = ${f.value}${f.unit ?? ""} ` +
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

  setLink: (link) => set((s) => (s.link === link ? s : { link })),

  setMeta: (meta) => set({ meta }),

  clearAlarms: () => set((s) => (s.alarms.length === 0 ? s : { alarms: [] })),

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