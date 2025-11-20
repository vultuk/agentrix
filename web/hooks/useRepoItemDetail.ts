import { useEffect, useState } from "react";
import { getIssueDetail, getPullDetail } from "../lib/api";
import { IssueDetail, PullDetail } from "../types/github";

export type ItemSelection =
  | { type: "issue"; number: number }
  | { type: "pull"; number: number }
  | null;

export function useRepoItemDetail(owner: string | null, repo: string | null, selection: ItemSelection) {
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [pull, setPull] = useState<PullDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!owner || !repo || !selection) {
      setIssue(null);
      setPull(null);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    const fetchDetail = async () => {
      try {
        if (selection.type === "issue") {
          const detail = await getIssueDetail(owner, repo, selection.number);
          if (active) {
            setIssue(detail);
            setPull(null);
          }
        } else {
          const detail = await getPullDetail(owner, repo, selection.number);
          if (active) {
            setPull(detail);
            setIssue(null);
          }
        }
      } catch (err) {
        if (active) {
          setError((err as Error).message);
          setIssue(null);
          setPull(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchDetail();

    return () => {
      active = false;
    };
  }, [owner, repo, selection?.type, selection?.number]);

  return { issue, pull, loading, error } as const;
}
