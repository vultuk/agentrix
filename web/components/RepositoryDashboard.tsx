import { useMemo, useState } from "react";
import { SessionRepository } from "../types/sessions";
import { RepoSummary, GitHubUser, IssueDetail, PullDetail } from "../types/github";
import { SlideOver } from "./SlideOver";
import { ItemSelection, useRepoItemDetail } from "../hooks/useRepoItemDetail";
import { MarkdownContent } from "./MarkdownContent";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

type Props = {
  repo: SessionRepository;
  summary: RepoSummary | null;
  loading: boolean;
  error: string | null;
  owner: string | null;
};

type Selection =
  | { kind: "issue"; number: number; title: string }
  | { kind: "pull"; number: number; title: string }
  | null;

export function RepositoryDashboard({ repo, summary, loading, error, owner }: Props) {
  const stats = [
    { label: "Open Issues", value: summary?.open_issues_count ?? 0 },
    { label: "In Progress Plans", value: repo.plans.length },
    { label: "Active Worktrees", value: repo.worktrees.length },
    { label: "Open Pull Requests", value: summary?.open_prs_count ?? 0 },
  ];

  const issues = summary?.issues ?? [];
  const pullRequests = summary?.pull_requests ?? [];

  const [selected, setSelected] = useState<Selection>(null);
  const detailSelection: ItemSelection = selected
    ? { type: selected.kind === "issue" ? "issue" : "pull", number: selected.number }
    : null;

  const { issue, pull, loading: detailLoading, error: detailError } = useRepoItemDetail(
    owner,
    repo.name,
    detailSelection
  );

  const detailTitle = useMemo(() => {
    if (!selected) return "";
    return selected.kind === "issue" ? `Issue #${selected.number}` : `PR #${selected.number}`;
  }, [selected]);

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3"
          >
            <p className="text-3xl font-semibold text-white">{stat.value}</p>
            <p className="text-sm text-zinc-400">{stat.label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Could not load GitHub data: {error}
        </div>
      )}

      {loading && (
        <div className="text-sm text-zinc-400">Loading GitHub data…</div>
      )}

      <div className="grid flex-1 grid-cols-1 gap-6 md:grid-cols-2">
        <Column
          title="Open Issues"
          totalCount={summary?.open_issues_count ?? issues.length}
          items={issues.map((issue) => ({
            title: issue.title,
            url: issue.html_url,
            tags: issue.labels,
            assignee: issue.assignee,
            number: issue.number,
            onSelect: () => setSelected({ kind: "issue", number: issue.number, title: issue.title }),
          }))}
        />
        <Column
          title="Pull Requests"
          totalCount={summary?.open_prs_count ?? pullRequests.length}
          items={pullRequests.map((pr) => ({
            title: pr.title,
            url: pr.html_url,
            tags: pr.labels,
            assignee: pr.user,
            number: pr.number,
            onSelect: () => setSelected({ kind: "pull", number: pr.number, title: pr.title }),
          }))}
        />
      </div>

      {selected && (
        <SlideOver title={detailTitle} onClose={() => setSelected(null)}>
          <DetailContent
            issue={issue}
            pull={pull}
            loading={detailLoading}
            error={detailError}
            fallbackTitle={selected.title}
          />
        </SlideOver>
      )}
    </div>
  );
}

type ColumnItem = {
  title: string;
  url: string;
  tags: string[];
  assignee?: GitHubUser;
  number: number;
  onSelect: () => void;
};

function Column({ title, items, totalCount }: { title: string; items: ColumnItem[]; totalCount: number }) {
  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">{title}</h2>
        <span className="text-xs text-zinc-500">
          Showing {items.length} of {totalCount}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto rounded-lg border border-zinc-900/0">
        <ul className="divide-y divide-zinc-800">
          {items.map((item) => (
            <li
              key={`${title}-${item.number}`}
              className="flex items-center justify-between gap-3 p-4 hover:bg-zinc-800/50"
            >
              <div className="min-w-0 space-y-1">
                <button
                  type="button"
                  onClick={item.onSelect}
                  className="truncate text-left text-sm font-medium text-white hover:underline"
                >
                  {item.title}
                </button>
                <div className="flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-300"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <Avatar assignee={item.assignee} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Avatar({ assignee }: { assignee?: GitHubUser }) {
  if (!assignee) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-200">
        ?
      </div>
    );
  }

  const fallback = initials(assignee.login);

  return (
    <div className="flex-shrink-0">
      {assignee.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={assignee.avatar_url}
          alt={assignee.login}
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-200">
          {fallback || "?"}
        </div>
      )}
    </div>
  );
}

function DetailContent({
  issue,
  pull,
  loading,
  error,
  fallbackTitle,
}: {
  issue: IssueDetail | null;
  pull: PullDetail | null;
  loading: boolean;
  error: string | null;
  fallbackTitle: string;
}) {
  if (loading) {
    return <p className="text-sm text-zinc-400">Loading…</p>;
  }

  if (error) {
    return <p className="text-sm text-rose-300">{error}</p>;
  }

  const detail = issue ?? pull;
  if (!detail) {
    return <p className="text-sm text-zinc-400">No details available.</p>;
  }

  const maybeIssue = detail as IssueDetail | (PullDetail & { assignee?: undefined });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-lg font-semibold text-white">{detail.title || fallbackTitle}</p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-200">{detail.state}</span>
          {detail.labels.map((label) => (
            <span
              key={label}
              className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-300"
            >
              {label}
            </span>
          ))}
        </div>
        <a
          href={detail.html_url}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-sky-300 hover:underline"
        >
          View on GitHub
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-zinc-300">
        <InfoItem label="Number" value={`#${detail.number}`} />
        <InfoItem label="State" value={detail.state} />
        {detail.user && <InfoItem label="Author" value={detail.user.login} />}
        {"assignee" in maybeIssue && maybeIssue.assignee ? (
          <InfoItem label="Assignee" value={maybeIssue.assignee.login} />
        ) : null}
      </div>

      <div className="leading-relaxed whitespace-pre-wrap text-sm text-zinc-200">
        {detail.body ? <MarkdownContent source={detail.body} /> : "No description."}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="text-sm text-slate-200">{value}</p>
    </div>
  );
}
