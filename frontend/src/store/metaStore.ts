import { create } from "zustand";
import type { MetaResponse } from "@/types/meta";

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

/** Convenience selector — call after meta has loaded */
export function useSubsystem(key: string | null | undefined) {
  return useMeta((s) => (key ? s.meta?.subsystems[key] : undefined));
}

export function useCard(subsystemKey: string, cardKey: string) {
  return useMeta((s) => s.meta?.subsystems[subsystemKey]?.cards[cardKey]);
}

export function useAllApids() {
  return useMeta((s) => s.meta?.apids ?? []);
}

export function useLinks() {
  return useMeta((s) => s.meta?.links ?? []);
}