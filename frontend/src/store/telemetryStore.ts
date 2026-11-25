import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DecodedPacket } from "@/types/packet";
import type { MetaResponse } from "@/types/meta";
import { packetId } from "@/types/packet";
import { API_BASE } from "@/lib/api";

export type LinkState = "connected" | "connecting" | "disconnected";

export interface Alarm {
  id: string;
  db_id?: number;        // for DB-sourced alarms
  packet_id?: number;    // link to the packet that triggered it
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
  sessionStart: number; 
  
  hasHydrated: boolean;
  isHydrating: boolean;

  selectedPacketId: string | null;
  diffBaseId: string | null;
  sidebarOpen: boolean;
  bookmarks: string[];

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
  addPackets: (batch: DecodedPacket[]) => void;
  hydrateFromHistory: () => Promise<void>;
}

const MAX_PACKETS = 10000;
const MAX_ALARMS = 100;

export const useTelemetry = create<TelemetryState>()(
  persist(
    (set) => ({
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
      hasHydrated: false,
      isHydrating: false,

      hydrateFromHistory: async () => {
        const { hasHydrated } = useTelemetry.getState();
        if (hasHydrated) return;
        useTelemetry.setState({ isHydrating: true, hasHydrated: true });
        try {
          const now = new Date();
          const start = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
          const res = await fetch(
            `${API_BASE}/api/history?start=${start}&end=${now.toISOString()}&limit=10000&order=desc`
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const j = await res.json();
          const rows = (j.packets ?? []).map((r: any) => ({
            ...r,
            // ⭐ Round to milliseconds to match WS timestamp format
            timestamp: Math.round(new Date(r.ts).getTime()) / 1000,
            apid_name: r.card ?? "",
            subsystem: r.subsystem ?? "",
            card: r.card ?? "",
            hw_class: "",
            length: r.raw_hex ? r.raw_hex.length / 2 : 0,
            payload_hex: "",
            raw_hex: r.raw_hex ?? "",
            fields: {},
            cc: 0,
          })) as DecodedPacket[];

          const asc = [...rows].reverse();
          useTelemetry.setState((state) => {
            const existingIds = new Set(state.packets.map(packetId));
            const fresh = asc.filter((p) => !existingIds.has(packetId(p)));
            const combined = [...state.packets, ...fresh].slice(-MAX_PACKETS);
            return { packets: combined, isHydrating: false, hasHydrated: true };
          });
        } catch {
          useTelemetry.setState({ isHydrating: false, hasHydrated: true });
        }
      },

      setSessionState: (start, count) =>
        set({
          sessionStart: start * 1000,
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

          // ⭐ Deduplicate against existing packets in the store
          const existingIds = new Set(state.packets.map(packetId));
          const dedupedBatch = batch.filter((p) => {
            const id = packetId(p);
            if (existingIds.has(id)) return false;
            existingIds.add(id);
            return true;
          });

          for (const p of dedupedBatch) {
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

          let nextSelected = state.selectedPacketId;
          if (!nextSelected && dedupedBatch.length > 0) {
            nextSelected = packetId(dedupedBatch[dedupedBatch.length - 1]);
          }

          return {
            packets: [...state.packets, ...dedupedBatch].slice(-MAX_PACKETS),
            latestByApid: latest,
            latestByParam: latestParam,
            alarms: [...state.alarms, ...newAlarms].slice(-MAX_ALARMS),
            lastPacketAt: Date.now(),
            totalReceived: isLive ? state.totalReceived + dedupedBatch.length : state.totalReceived,
            selectedPacketId: nextSelected,
          };
        }),
      
      addPackets: (batch) =>
        set((state) => {
          if (!batch || batch.length === 0) return state;
          
          const latest = { ...state.latestByApid };
          const latestParam = { ...state.latestByParam };

          // ⭐ Deduplicate against existing packets
          const existingIds = new Set(state.packets.map(packetId));
          const newPackets = batch.filter((p) => {
            const id = packetId(p);
            if (existingIds.has(id)) return false;
            existingIds.add(id);
            return true;
          });

          if (newPackets.length === 0) return state; // Nothing new to add

          for (const p of newPackets) {
            latest[p.apid] = p;
            for (const [name] of Object.entries(p.fields ?? {})) {
              latestParam[`${p.apid}:${name}`] = p;
            }
          }

          const combined = [...state.packets, ...newPackets].slice(-MAX_PACKETS);

          return {
            packets: combined,
            latestByApid: latest,
            latestByParam: latestParam,
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
      partialize: (state) => ({
        bookmarks: state.bookmarks,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === "tm-viewer-telemetry") {
      useTelemetry.persist.rehydrate();
    }
  });
}