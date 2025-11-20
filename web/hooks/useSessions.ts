import { useCallback, useEffect, useState } from "react";
import { getSessions } from "../lib/api";
import { SessionWorkspace } from "../types/sessions";

export function useSessions() {
  const [sessions, setSessions] = useState<SessionWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const data = await getSessions(signal);
        setSessions(data);
        setError(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message);
      } finally {
        if (!signal || !signal.aborted) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  return { sessions, loading, error, refresh, setError } as const;
}

