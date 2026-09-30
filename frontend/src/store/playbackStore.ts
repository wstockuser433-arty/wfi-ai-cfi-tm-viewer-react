import { create } from "zustand";
import type { DecodedPacket } from "@/types/packet";
import type { MetaResponse } from "@/types/meta";

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

interface State {
  packets: DecodedPacket[];
  latestByApid: Record<number, DecodedPacket>;
  latestByParam: Record<string, DecodedPacket>; // `${apid}:${param}` → latest pkt
  alarms: Alarm[];
  link: "connected" | "connecting" | "disconnected";
  totalReceived: number;
  meta: MetaResponse | null;

  ingest: (batch: DecodedPacket[]) => void;
  setLink: (s: State["link"]) => void;
  setMeta: (m: MetaResponse) => void;
  clearAlarms: () => void;
}

export const useTelemetry = create<State>((set) => ({
  packets: [],
  latestByApid: {},
  latestByParam: {},
  alarms: [],
  link: "disconnected",
  totalReceived: 0,
  meta: null,

  ingest: (batch) => set((state) => {
    const latest = { ...state.latestByApid };
    const latestParam = { ...state.latestByParam };
    const newAlarms: Alarm[] = [];

    for (const p of batch) {
      latest[p.apid] = p;
      for (const [name, f] of Object.entries(p.fields)) {
        latestParam[`${p.apid}:${name}`] = p;
        if (f.status !== "OK") {
          const id = `${p.apid}:${name}:${f.status}`;
          if (!state.alarms.find(a => a.id === id)) {
            newAlarms.push({
              id, ts: p.timestamp,
              severity: f.status === "CRIT" ? "CRIT" : "WARN",
              subsystem: p.subsystem, card: p.card, apid: p.apid, param: name,
              message: `${p.subsystem}/${p.card}.${name} = ${f.value}${f.unit} (lim ${f.limits.join("–")})`,
            });
          }
        }
      }
    }

    return {
      packets: [...state.packets, ...batch].slice(-1000),
      latestByApid: latest,
      latestByParam: latestParam,
      alarms: [...state.alarms, ...newAlarms].slice(-100),
      totalReceived: state.totalReceived + batch.length,
    };
  }),

  setLink: (link) => set({ link }),
  setMeta: (meta) => set({ meta }),
  clearAlarms: () => set({ alarms: [] }),
}));