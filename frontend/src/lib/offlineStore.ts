import { API_BASE } from "@/lib/api";
import type { DecodedPacket } from "@/types/packet";

// The offline dump lives on the backend (written by POST /api/upload), so it is
// shared by every browser that talks to the same backend.

export async function loadOfflineDump(): Promise<DecodedPacket[]> {
  try {
    const res = await fetch(`${API_BASE}/api/offline-dump`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.packets) ? data.packets : [];
  } catch (e) {
    console.warn("[offlineStore] Load failed:", e);
    return [];
  }
}

export async function clearOfflineDump(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/offline-dump`, { method: "DELETE" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.warn("[offlineStore] Clear failed:", e);
  }
}