import { create } from "zustand";
import type { MetaResponse, CardSpec, ApidEntry } from "@/types/meta";

interface MetaState {
  meta: MetaResponse | null;
  loading: boolean;
  error: string | null;
  setMeta: (m: MetaResponse) => void;
  setLoading: (l: boolean) => void;
  setError: (e: string | null) => void;
  reset: () => void;
}

export const useMeta = create<MetaState>((set) => ({
  meta: null,
  loading: false,
  error: null,
  setMeta: (meta) => set({ meta, loading: false, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  reset: () => set({ meta: null, loading: false, error: null }),
}));

// ─── Selectors ─────────────────────────────────────────────
export function useCard(cardKey: string | null | undefined): CardSpec | undefined {
  return useMeta((s) => {
    if (!cardKey || !s.meta) return undefined;
    // Try flat cards map first
    if (s.meta.cards?.[cardKey]) return s.meta.cards[cardKey];
    // Otherwise iterate subsystems
    for (const sub of Object.values(s.meta.subsystems ?? {})) {
      const c = sub.cards?.[cardKey];
      if (c) return c;
    }
    return undefined;
  });
}

export function useCardByApid(apid: number | null | undefined): CardSpec | undefined {
  return useMeta((s) => {
    if (apid == null || !s.meta) return undefined;
    const entry = s.meta.apids.find((a) => a.apid === apid);
    if (!entry) return undefined;
    // Prefer flat cards map
    if (s.meta.cards?.[entry.card]) return s.meta.cards[entry.card];
    // Fallback to subsystem nesting
    const sub = s.meta.subsystems[entry.subsystem];
    return sub?.cards[entry.card];
  });
}

export function useApidList(): ApidEntry[] {
  return useMeta((s) => s.meta?.apids ?? []);
}