import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";
import { useTelemetry } from "@/store/telemetryStore";

export function useMeta() {
  const setMeta = useTelemetry(s => s.setMeta);
  const { data } = useQuery({
    queryKey: ["meta"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/meta`);
      return r.json();
    },
    staleTime: Infinity,
  });
  useEffect(() => { if (data) setMeta(data); }, [data, setMeta]);
}