import { SessionWorkspace } from "../types/sessions";
import { IconBranch, IconChevron, IconGhost, IconOrg, IconPlus, IconRepo } from "./icons";

type Props = {
  sessions: SessionWorkspace[];
  loading: boolean;
  error: string | null;
  activeWorkspace: string | null;
  activeRepo: string | null;
  activeWorktree: string | null;
  accordionOpen: Record<string, boolean>;
  onSelectWorkspace: (workspace: string) => void;
  onSelectRepo: (workspace: string, repo: string) => void;
  onSelectWorktree: (workspace: string, repo: string, worktree: string) => void;
  onToggleWorkspace: (workspace: string) => void;
  onAddRepository: (workspace: string) => void;
  onAddWorktree: (workspace: string, repo: string) => void;
};

export function Sidebar({
  sessions,
  loading,
  error,
  activeWorkspace,
  activeRepo,
  activeWorktree,
  accordionOpen,
  onSelectWorkspace,
  onSelectRepo,
  onSelectWorktree,
  onToggleWorkspace,
  onAddRepository,
  onAddWorktree,
}: Props) {
  return (
    <aside className="relative z-10 flex h-screen flex-col bg-zinc-900 p-5">
      <div className="space-y-1 pb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Sessions</p>
        <h1 className="text-base font-semibold text-slate-100">Workspace Explorer</h1>
        <p className="text-xs leading-relaxed text-slate-500">
          Organisations, repositories, plans, and worktrees from the API.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto pr-1">
          {loading && <p className="text-slate-400">Loading sessions…</p>}
          {error && <p className="text-rose-300">Could not load sessions: {error}</p>}
          {!loading && !error && sessions.length === 0 && (
            <p className="text-slate-500">No workspaces yet.</p>
          )}

          {!loading && !error && (
            <div className="space-y-2">
              {sessions.map((workspace) => {
                const isActiveWorkspace = workspace.name === activeWorkspace;
                const isOpen = accordionOpen[workspace.name] ?? isActiveWorkspace;
                return (
                  <div key={workspace.name} className="group">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectWorkspace(workspace.name)}
                        className="group mt-6 flex w-full items-center gap-2 px-2 py-1.5 text-left transition hover:bg-zinc-800 first:mt-0 text-slate-300"
                      >
                        <span className="text-zinc-400">
                          <IconOrg className="h-4 w-4" />
                        </span>
                        <span
                          className={`text-sm font-medium whitespace-nowrap overflow-hidden text-ellipsis ${
                            isActiveWorkspace ? "text-white" : "text-slate-200"
                          }`}
                        >
                          {workspace.name}
                        </span>
                      </button>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onToggleWorkspace(workspace.name)}
                          className="flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:text-slate-100"
                          aria-label={`Toggle ${workspace.name}`}
                        >
                          <IconChevron className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-90" : ""}`} />
                        </button>
                      </div>
                    </div>

                    {isOpen && (
                      <div className="ml-2 mt-1 space-y-1 border-l border-white/10 pl-3">
                        {workspace.repositories.map((repo) => {
                          const isActiveRepo = workspace.name === activeWorkspace && repo.name === activeRepo;
                          const isRepoEmpty = repo.plans.length === 0 && repo.worktrees.length === 0;
                          return (
                            <div key={repo.name} className="group">
                              <div className="flex items-center gap-2 pr-1">
                                <button
                                  type="button"
                                  onClick={() => onSelectRepo(workspace.name, repo.name)}
                                  className={`group flex flex-1 items-center gap-2 px-2 py-1.5 text-left transition hover:bg-zinc-800 ${
                                    isActiveRepo && !activeWorktree
                                      ? "rounded-md bg-blue-500/15 text-white"
                                      : "text-zinc-400"
                                  }`}
                                >
                                  <span className="text-blue-300">
                                    <IconRepo className="h-4 w-4" />
                                  </span>
                                  <span className={`text-sm ${isActiveRepo ? "text-white" : ""}`}>
                                    {repo.name}
                                  </span>
                                  {isRepoEmpty && (
                                    <span className="text-[10px] text-zinc-500">
                                      <IconGhost className="mr-1 inline h-3 w-3" />empty
                                    </span>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onAddWorktree(workspace.name, repo.name)}
                                  className="flex h-7 w-7 items-center justify-center rounded border border-transparent text-slate-200 transition hover:border-blue-400/40 hover:text-blue-200"
                                  aria-label={`Add worktree to ${repo.name}`}
                                >
                                  <IconPlus className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              {repo.plans.length > 0 && (
                                <div className="ml-1 space-y-1 border-l border-white/10 pl-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                    Plans
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    {repo.plans.map((plan) => (
                                      <span
                                        key={plan.session_id}
                                        className="text-[11px] font-semibold text-blue-200"
                                      >
                                        {plan.name}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {repo.worktrees.length > 0 && (
                                <div className="ml-1 mt-1 space-y-1 border-l border-white/10 pl-3">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                                    Worktrees
                                  </p>
                                  <ul className="space-y-1">
                                    {repo.worktrees.map((wt) => {
                                      const isActiveWorktree =
                                        workspace.name === activeWorkspace &&
                                        repo.name === activeRepo &&
                                        wt.name === activeWorktree;
                                      return (
                                        <li key={wt.name}>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onSelectWorktree(workspace.name, repo.name, wt.name)
                                            }
                                            className={`group flex w-full items-center gap-2 px-2 py-1.5 text-left transition hover:bg-zinc-800 ${
                                              isActiveWorktree
                                                ? "rounded-md bg-blue-500/15 text-white"
                                                : "text-zinc-400"
                                            }`}
                                          >
                                            <span className="text-zinc-400">
                                              <IconBranch className="h-3.5 w-3.5" />
                                            </span>
                                            <span className={`text-sm ${isActiveWorktree ? "text-white" : ""}`}>
                                              {wt.name}
                                            </span>
                                          </button>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={() => onAddRepository(activeWorkspace ?? sessions[0]?.name ?? "")}
            className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
          >
            <IconPlus className="h-4 w-4" />
            <span>Add Repository</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
