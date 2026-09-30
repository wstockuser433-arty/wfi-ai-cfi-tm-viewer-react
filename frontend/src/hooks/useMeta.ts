import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import { useTelemetry } from "@/store/telemetryStore";
import { useMeta as useMetaStore } from "@/store/metaStore";
import type { MetaResponse } from "@/types/meta";

export function useMeta() {
  const setTelemetryMeta = useTelemetry((s) => s.setMeta);
  const setMetaStore = useMetaStore((s) => s.setMeta);
  const setLoading = useMetaStore((s) => s.setLoading);
  const setError = useMetaStore((s) => s.setError);

  const { data, isLoading, error } = useQuery<MetaResponse>({
    queryKey: ["meta"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/meta`);
      if (!r.ok) throw new Error(`meta fetch failed: ${r.status}`);
      return r.json();
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    setLoading(isLoading);
    if (data) {
      setTelemetryMeta(data);
      setMetaStore(data);
    }
    if (error) setError(String(error));
  }, [data, isLoading, error, setTelemetryMeta, setMetaStore, setLoading, setError]);
}