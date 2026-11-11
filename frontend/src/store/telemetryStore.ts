import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DecodedPacket } from "@/types/packet";
import type { MetaResponse } from "@/types/meta";
import { packetId } from "@/types/packet";

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
  // ─── Data ───────────────────────────────────────────
  packets: DecodedPacket[];
  latestByApid: Record<number, DecodedPacket>;
  latestByParam: Record<string, DecodedPacket>;
  alarms: Alarm[];
  link: LinkState;
  lastPacketAt: number;
  totalReceived: number;
  meta: MetaResponse | null;
  sessionStart: number; 

  // ─── Selection & UI ─────────────────────────────────
  selectedPacketId: string | null;
  diffBaseId: string | null;
  sidebarOpen: boolean;
  bookmarks: string[];

  // ─── Actions ────────────────────────────────────────
  ingest: (batch: DecodedPacket[], isLive?: boolean) => void;  
  setLink: (s: LinkState) => void;
  setMeta: (m: MetaResponse) => void;
  clearAlarms: () => void;
  setSessionState: (start: number, count: number) => void; 
  reset: () => void;

  setSelectedPacketId: (id: string | null) => void;
  setDiffBaseId: (id: string | null) => void;
  toggleSidebar: () => void;
  toggleBookmark: (id: string) => void;
}

const MAX_PACKETS = 2000;
const MAX_ALARMS = 100;

export const useTelemetry = create<TelemetryState>()(
  persist(
    (set) => ({
      // ─── Initial state ──────────────────────────────
      packets: [],
      latestByApid: {},
      latestByParam: {},
      alarms: [],
      link: "disconnected",
      lastPacketAt: 0,
      totalReceived: 0,
      meta: null,
      sessionStart: Date.now(), 
      selectedPacketId: null,
      diffBaseId: null,
      sidebarOpen: true,
      bookmarks: [],

      // ─── Actions ────────────────────────────────────
      setSessionState: (start, count) =>
        set({
          sessionStart: start * 1000,  // backend sends seconds; store as ms
          totalReceived: count,
        }),

      setSelectedPacketId: (id) => set({ selectedPacketId: id }),
      setDiffBaseId: (id) => set({ diffBaseId: id }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      toggleBookmark: (id) =>
        set((state) => {
          const isBookmarked = state.bookmarks.includes(id);
          return {
            bookmarks: isBookmarked
              ? state.bookmarks.filter((b) => b !== id)
              : [...state.bookmarks, id],
          };
        }),

      ingest: (batch: DecodedPacket[], isLive: boolean = true) =>
        set((state) => {
          if (!batch || batch.length === 0) return state;

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

          // Auto-select the latest packet if nothing is selected
          let nextSelected = state.selectedPacketId;
          if (!nextSelected && batch.length > 0) {
            nextSelected = packetId(batch[batch.length - 1]);
          }

          return {
            packets: [...state.packets, ...batch].slice(-MAX_PACKETS),
            latestByApid: latest,
            latestByParam: latestParam,
            alarms: [...state.alarms, ...newAlarms].slice(-MAX_ALARMS),
            lastPacketAt: Date.now(),
            totalReceived: isLive ? state.totalReceived + batch.length : state.totalReceived,
            selectedPacketId: nextSelected,
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
          sessionStart: Date.now(),
          selectedPacketId: null,
          diffBaseId: null,
        }),
    }),
    {
      name: "tm-viewer-telemetry",
      // Only persist bookmarks + sidebar state, not live packets
      partialize: (state) => ({
        bookmarks: state.bookmarks,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);