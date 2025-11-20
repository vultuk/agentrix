import { SessionRepository, SessionWorktree, SessionWorkspace } from "../types/sessions";
import { IconBranch, IconRepo } from "./icons";
import { RepositoryDashboard } from "./RepositoryDashboard";
import { useRepoSummary } from "../hooks/useRepoSummary";

type Props = {
  activeWorkspace: SessionWorkspace | null;
  activeRepo: SessionRepository | null;
  activeWorktree: SessionWorktree | null;
};

export function DetailsPanel({ activeWorkspace, activeRepo, activeWorktree }: Props) {
  const repoCount = activeWorkspace?.repositories.length ?? 0;
  const worktreeCount =
    activeWorkspace?.repositories.reduce((sum, repo) => sum + repo.worktrees.length, 0) ?? 0;
  const recentActivity =
    activeWorkspace?.repositories
      .flatMap((repo) => {
        const planItems = repo.plans.map((plan) => ({
          type: "plan" as const,
          name: plan.name,
          context: repo.name,
        }));
        const worktreeItems = repo.worktrees.map((wt) => ({
          type: "worktree" as const,
          name: wt.name,
          context: repo.name,
        }));
        return [...planItems, ...worktreeItems];
      })
      .slice(0, 6) ?? [];

  const breadcrumb = [activeWorkspace?.name, activeRepo?.name, activeWorktree?.name].filter(Boolean);

  const { data: repoSummary, loading: summaryLoading, error: summaryError } = useRepoSummary(
    activeWorkspace?.name ?? null,
    activeRepo?.name ?? null
  );

  if (activeRepo && !activeWorktree) {
    return (
      <div className="flex h-full flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
            {[activeWorkspace?.name, activeRepo.name]
              .filter(Boolean)
              .map((item, index) => (
                <div key={`${item}-${index}`} className="flex items-center gap-2">
                  {index > 0 && <span className="text-zinc-600">/</span>}
                  <span className="text-sm text-zinc-300">{item as string}</span>
                </div>
              ))}
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-300">
            <span className="font-semibold">
              Repos: <span className="text-white">{repoCount}</span>
            </span>
            <span className="font-semibold">
              Worktrees: <span className="text-white">{worktreeCount}</span>
            </span>
            <span className="font-semibold">
              Plans: <span className="text-white">{activeRepo.plans.length}</span>
            </span>
          </div>
          </div>

        <RepositoryDashboard
          repo={activeRepo}
          summary={repoSummary}
          loading={summaryLoading}
          error={summaryError}
          owner={activeWorkspace?.name ?? null}
        />
      </div>
    );
  }

  if (!activeWorktree) {
    return (
      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-xl font-semibold text-slate-50">Welcome back</h2>
          <p className="text-sm text-slate-400">
            Pick a worktree on the left or add a new repository/worktree to begin.
          </p>
          <div className="flex flex-wrap gap-4 text-xs text-zinc-400">
            <span>
              Repositories: <span className="text-white">{repoCount}</span>
            </span>
            <span>
              Worktrees: <span className="text-white">{worktreeCount}</span>
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Recent Activity
          </p>
          {recentActivity.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Nothing to show yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {recentActivity.map((item, index) => (
                <li key={`${item.type}-${item.name}-${index}`} className="flex items-center gap-2">
                  <span className="text-slate-400">
                    {item.type === "plan" ? <IconRepo className="h-4 w-4" /> : <IconBranch className="h-4 w-4" />}
                  </span>
                  <span className="text-sm text-slate-100">{item.name}</span>
                  <span className="text-[11px] text-zinc-500">{item.context}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
        {breadcrumb.length ? (
          breadcrumb.map((item, index) => (
            <div key={`${item}-${index}`} className="flex items-center gap-2">
              {index > 0 && <span className="text-zinc-600">/</span>}
              <span className={`text-sm ${index === 2 ? "text-blue-300" : "text-zinc-300"}`}>
                {item as string}
              </span>
            </div>
          ))
        ) : (
          <span className="text-zinc-500">Select a workspace to get started.</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-300">
        <span className="font-semibold">
          Repos: <span className="text-white">{repoCount}</span>
        </span>
        <span className="font-semibold">
          Worktrees: <span className="text-white">{worktreeCount}</span>
        </span>
        <span className="font-semibold">
          Terminals: <span className="text-white">{activeWorktree.terminals.length}</span>
        </span>
      </div>

      <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <p className="text-base font-medium text-slate-50">{activeWorktree.name}</p>
        <p className="text-[11px] text-slate-400">
          {activeWorkspace?.name} / {activeRepo?.name}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Terminals</p>
          {activeWorktree.terminals.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">Add a terminal to get started.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {activeWorktree.terminals.map((term) => (
                <li key={term.session_id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300">
                      <IconRepo className="h-4 w-4" />
                    </span>
                    <span className="text-slate-100">{term.name}</span>
                    <span className="text-[11px] text-zinc-500">{term.session_id}</span>
                  </div>
                  {term.dangerous && <span className="text-[10px] text-rose-300">danger</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Plans</p>
          {activeRepo?.plans?.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {activeRepo.plans.map((plan) => (
                <span key={plan.session_id} className="text-[12px] font-semibold text-blue-200">
                  {plan.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No plans yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
