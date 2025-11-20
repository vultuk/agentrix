import { useCallback, useEffect, useState } from "react";
import { getRepoSummary } from "../lib/api";
import { RepoSummary } from "../types/github";

export function useRepoSummary(owner: string | null, repo: string | null) {
  const [data, setData] = useState<RepoSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!owner || !repo) {
        setData(null);
        return;
      }
      try {
        setLoading(true);
        const summary = await getRepoSummary(owner, repo);
        setData(summary);
        setError(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message || "Failed to load repository info");
      } finally {
        if (!signal || !signal.aborted) setLoading(false);
      }
    },
    [owner, repo]
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return { data, loading, error, reload: load } as const;
}

