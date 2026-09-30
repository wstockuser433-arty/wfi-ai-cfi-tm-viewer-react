import { create } from "zustand";

interface FilterState {
  subsystems: Set<string>;
  cards: Set<string>;
  hwClass: "ALL" | "HW" | "SW";
  search: string;
  toggleSubsystem: (s: string) => void;
  toggleCard: (c: string) => void;
  setHwClass: (h: FilterState["hwClass"]) => void;
  setSearch: (s: string) => void;
  reset: () => void;
}

export const useFilters = create<FilterState>((set, get) => ({
  subsystems: new Set(),
  cards: new Set(),
  hwClass: "ALL",
  search: "",

  toggleSubsystem: (s) => {
    const next = new Set(get().subsystems);
    next.has(s) ? next.delete(s) : next.add(s);
    set({ subsystems: next });
  },
  toggleCard: (c) => {
    const next = new Set(get().cards);
    next.has(c) ? next.delete(c) : next.add(c);
    set({ cards: next });
  },
  setHwClass: (hwClass) => set({ hwClass }),
  setSearch: (search) => set({ search }),
  reset: () =>
    set({
      subsystems: new Set(),
      cards: new Set(),
      hwClass: "ALL",
      search: "",
    }),
}));