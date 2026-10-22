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

// ──────────────────────────────────────────────────────────────────────
// Selectors — EBOX schema (no `subsystems` map, use `cards` + `apids`)
// ──────────────────────────────────────────────────────────────────────

/** Look up a card by its card key (e.g. "CAM_ELEC") */
export function useCard(cardKey: string | null | undefined): CardSpec | undefined {
  return useMeta((s) => (cardKey ? s.meta?.cards[cardKey] : undefined));
}

/** Look up a card by its apid (== unit_sub_id in EBOX) */
export function useCardByApid(apid: number | null | undefined): CardSpec | undefined {
  return useMeta((s) => {
    if (apid == null || !s.meta) return undefined;
    const entry = s.meta.apids.find((a) => a.apid === apid);
    return entry ? s.meta.cards[entry.card] : undefined;
  });
}

/** The whole apids list (for dropdowns, sidebar, trends picker) */
export function useApidList(): ApidEntry[] {
  return useMeta((s) => s.meta?.apids ?? []);
}

/**
 * Subsystem keys derived from the apids list — the closest equivalent to
 * the old `meta.subsystems` map.
 */
export function useSubsystemKeys(): string[] {
  return useMeta((s) => {
    if (!s.meta?.apids) return [];
    return Array.from(new Set(s.meta.apids.map((a) => a.subsystem))).sort();
  });
}

// Legacy alias to avoid breaking any other imports
export const useSubsystem = (key: string | null | undefined) => {
  return useMeta((s) => {
    if (!key || !s.meta) return undefined;
    const cards = s.meta.apids.filter((a) => a.subsystem === key);
    return cards.length ? { key, cards } : undefined;
  });
};