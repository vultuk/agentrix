import { useCallback, useEffect, useRef, useState } from "react";

type SessionTerminal = {
  name: string;
  type: string;
  dangerous?: boolean;
  session_id: string;
};

type SessionWorktree = {
  name: string;
  terminals: SessionTerminal[];
};

type SessionPlan = {
  name: string;
  session_id: string;
  related_issue?: number;
};

type SessionRepository = {
  name: string;
  plans: SessionPlan[];
  worktrees: SessionWorktree[];
};

type SessionWorkspace = {
  name: string;
  repositories: SessionRepository[];
};

type ApiResponse<T> = {
  data: T;
  message?: string;
};

const HANDLE_WIDTH = 5;

type IconProps = {
  className?: string;
};

const IconOrg = ({ className }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    className={className}
  >
    <path d="M4 21h16" strokeLinecap="round" />
    <path d="M5 10h4v11H5zM10 6h4v15h-4zM15 12h4v9h-4z" />
  </svg>
);

const IconRepo = ({ className }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    className={className}
  >
    <path d="M6 4h12v16H6z" />
    <path d="M9 8h6M9 12h6M9 16h3" strokeLinecap="round" />
  </svg>
);

const IconBranch = ({ className }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    className={className}
  >
    <path
      d="M6 5a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm8 14a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM8 7v10a2 2 0 0 0 2 2h6"
      strokeLinecap="round"
    />
    <path d="M16 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z" />
    <path d="M16 7v4" strokeLinecap="round" />
  </svg>
);

const IconPlus = ({ className }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    className={className}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
  </svg>
);

const IconChevron = ({ className }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    className={className}
  >
    <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconGhost = ({ className }: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.4}
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M5 19v-7a7 7 0 0 1 14 0v7l-2-1-2 1-2-1-2 1-2-1-2 1Z"
    />
    <path d="M10 10h.01M14 10h.01" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Home() {
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const dragging = useRef(false);

  const [sessions, setSessions] = useState<SessionWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [repoTarget, setRepoTarget] = useState<string | null>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [activeWorktree, setActiveWorktree] = useState<string | null>(null);
  const [accordionOpen, setAccordionOpen] = useState<Record<string, boolean>>({});
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [branchInput, setBranchInput] = useState("");
  const [branchTarget, setBranchTarget] = useState<{ workspace: string; repo: string } | null>(null);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);

  const loadSessions = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const res = await fetch("/api/sessions", { signal });
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }
        const body: ApiResponse<SessionWorkspace[]> = await res.json();
        setSessions(body.data);
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
    loadSessions(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadSessions]);

  useEffect(() => {
    if (sessions.length === 0) {
      setActiveWorkspace(null);
      setActiveRepo(null);
      setActiveWorktree(null);
      return;
    }

    const nextWorkspace =
      sessions.find((w) => w.name === activeWorkspace) ?? sessions[0];
    if (nextWorkspace?.name !== activeWorkspace) {
      setActiveWorkspace(nextWorkspace.name);
    }

    const nextRepo =
      nextWorkspace.repositories.find((r) => r.name === activeRepo) ??
      nextWorkspace.repositories[0] ??
      null;
    if (nextRepo?.name !== activeRepo) {
      setActiveRepo(nextRepo?.name ?? null);
    }

    const nextWorktree =
      nextRepo?.worktrees.find((wt) => wt.name === activeWorktree) ??
      nextRepo?.worktrees[0] ??
      null;
    if (nextWorktree?.name !== activeWorktree) {
      setActiveWorktree(nextWorktree?.name ?? null);
    }

    setAccordionOpen((prev) => {
      const next = { ...prev };
      sessions.forEach((w) => {
        if (next[w.name] === undefined) {
          next[w.name] = w.name === nextWorkspace.name;
        }
      });
      next[nextWorkspace.name] = true;
      return next;
    });
  }, [sessions, activeWorkspace, activeRepo, activeWorktree]);

  useEffect(() => {
    const handleMove = (event: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(500, Math.max(220, event.clientX));
      setSidebarWidth(next);
    };

    const handleUp = () => {
      dragging.current = false;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, []);

  const startDrag = (event: React.MouseEvent) => {
    event.preventDefault();
    dragging.current = true;
  };

  const handleSelectWorkspace = (workspaceName: string) => {
    const workspace = sessions.find((w) => w.name === workspaceName);
    if (!workspace) return;
    setActiveWorkspace(workspaceName);
    const firstRepo = workspace.repositories[0];
    setActiveRepo(firstRepo?.name ?? null);
    setActiveWorktree(firstRepo?.worktrees[0]?.name ?? null);
    setAccordionOpen((prev) => ({ ...prev, [workspaceName]: true }));
  };

  const toggleWorkspaceOpen = (workspaceName: string) => {
    setAccordionOpen((prev) => ({ ...prev, [workspaceName]: !prev[workspaceName] }));
  };

  const handleSelectRepo = (workspaceName: string, repoName: string) => {
    const workspace = sessions.find((w) => w.name === workspaceName);
    const repo = workspace?.repositories.find((r) => r.name === repoName);
    if (!workspace || !repo) return;
    setActiveWorkspace(workspaceName);
    setActiveRepo(repoName);
    setActiveWorktree(repo.worktrees[0]?.name ?? null);
    setAccordionOpen((prev) => ({ ...prev, [workspaceName]: true }));
  };

  const handleSelectWorktree = (workspaceName: string, repoName: string, worktreeName: string) => {
    setActiveWorkspace(workspaceName);
    setActiveRepo(repoName);
    setActiveWorktree(worktreeName);
    setAccordionOpen((prev) => ({ ...prev, [workspaceName]: true }));
  };

  const openRepoModal = (workspaceName: string) => {
    setRepoTarget(workspaceName);
    setShowCreateModal(true);
  };

  const openBranchModal = (workspaceName: string, repoName: string) => {
    setBranchTarget({ workspace: workspaceName, repo: repoName });
    setBranchInput("");
    setBranchError(null);
    setShowBranchModal(true);
  };

  const handleCreateSession = async () => {
    if (!repoInput.trim()) {
      setCreateError("Repository URL is required.");
      return;
    }

    try {
      setCreating(true);
      setCreateError(null);
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ repository_url: repoInput.trim() }),
      });

      if (!res.ok) {
        let message = `Create failed: ${res.status}`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body?.message) {
            message = body.message;
          }
        } catch {
          /* ignore parse errors */
        }
        throw new Error(message);
      }

      await loadSessions();
      setShowCreateModal(false);
      setRepoInput("");
      setRepoTarget(null);
    } catch (err) {
      setCreateError((err as Error).message || "Could not create session.");
    } finally {
      setCreating(false);
    }
  };

  const handleCreateWorktree = async () => {
    if (!branchTarget) {
      setBranchError("Choose a repository first.");
      return;
    }
    if (!branchInput.trim()) {
      setBranchError("Branch name is required.");
      return;
    }

    try {
      setCreatingBranch(true);
      setBranchError(null);
      const res = await fetch(
        `/api/sessions/${branchTarget.workspace}/${branchTarget.repo}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ branch: branchInput.trim() }),
        }
      );

      if (!res.ok) {
        let message = `Create failed: ${res.status}`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body?.message) {
            message = body.message;
          }
        } catch {
          /* ignore parse errors */
        }
        throw new Error(message);
      }

      await loadSessions();
      setShowBranchModal(false);
      setBranchInput("");
      setActiveWorkspace(branchTarget.workspace);
      setActiveRepo(branchTarget.repo);
      setActiveWorktree(branchInput.trim());
    } catch (err) {
      setBranchError((err as Error).message || "Could not create worktree.");
    } finally {
      setCreatingBranch(false);
    }
  };

  const activeWorkspaceData = sessions.find((w) => w.name === activeWorkspace) ?? null;
  const activeRepoData =
    activeWorkspaceData?.repositories.find((r) => r.name === activeRepo) ?? null;
  const activeWorktreeData =
    activeRepoData?.worktrees.find((wt) => wt.name === activeWorktree) ?? null;

  const repoCount = activeWorkspaceData?.repositories.length ?? 0;
  const worktreeCount =
    activeWorkspaceData?.repositories.reduce(
      (sum, repo) => sum + repo.worktrees.length,
      0
    ) ?? 0;

  const recentActivity =
    activeWorkspaceData?.repositories
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

  return (
    <main
      className="grid h-screen min-h-screen overflow-hidden bg-[#050507] text-slate-200"
      style={{ gridTemplateColumns: `${sidebarWidth}px ${HANDLE_WIDTH}px 1fr` }}
    >
      <aside className="relative z-10 flex h-screen flex-col border-r border-white/5 bg-zinc-900 p-5">
        <div className="mb-5 space-y-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Sessions</p>
          <h1 className="text-base font-semibold text-slate-100">Workspace Explorer</h1>
          <p className="text-xs leading-relaxed text-slate-500">
            Organisations, repositories, plans, and worktrees from the API.
          </p>
        </div>

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
                        onClick={() => handleSelectWorkspace(workspace.name)}
                        className={`group mt-6 flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-zinc-800/50 first:mt-0 ${
                          isActiveWorkspace
                            ? "border-l-2 border-blue-500 bg-blue-500/15 text-white"
                            : "text-slate-300"
                        }`}
                      >
                        <span className="text-zinc-400">
                          <IconOrg className="h-4 w-4" />
                        </span>
                        <span
                          className={`text-[11px] font-bold uppercase tracking-[0.2em] whitespace-nowrap overflow-hidden text-ellipsis ${
                            isActiveWorkspace ? "text-white" : "text-slate-200"
                          }`}
                        >
                          {workspace.name}
                        </span>
                        {isActiveWorkspace && (
                          <span className="text-[10px] font-mono font-semibold text-blue-400">active</span>
                        )}
                      </button>
                      <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => openRepoModal(workspace.name)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-transparent text-slate-200 transition hover:border-blue-400/40 hover:text-blue-200"
                          aria-label={`Add repository to ${workspace.name}`}
                        >
                          <IconPlus className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleWorkspaceOpen(workspace.name)}
                          className="flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:text-slate-100"
                          aria-label={`Toggle ${workspace.name}`}
                        >
                          <IconChevron className={`h-3.5 w-3.5 transition ${isOpen ? "rotate-90" : ""}`} />
                        </button>
                      </div>
                      </div>

                    {isOpen && (
                      <div className="ml-3 mt-1 space-y-1 border-l border-white/10 pl-3">
                        {workspace.repositories.map((repo) => {
                          const isActiveRepo =
                            workspace.name === activeWorkspace && repo.name === activeRepo;
                          const isRepoEmpty =
                            repo.plans.length === 0 && repo.worktrees.length === 0;
                          return (
                            <div key={repo.name} className="group">
                              <div className="flex items-center gap-2 pr-1">
                                <button
                                  type="button"
                                  onClick={() => handleSelectRepo(workspace.name, repo.name)}
                                  className={`group flex flex-1 items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-zinc-800/50 ${
                                    isActiveRepo
                                      ? "border-l-2 border-blue-500 bg-blue-500/15 text-white"
                                      : "text-zinc-400"
                                  }`}
                                >
                                  <span className="text-blue-300">
                                    <IconRepo className="h-4 w-4" />
                                  </span>
                                  <span
                                    className={`font-mono text-sm ${
                                      isActiveRepo ? "text-white" : ""
                                    }`}
                                  >
                                    {repo.name}
                                  </span>
                                  {isRepoEmpty && (
                                    <span className="text-[10px] font-mono text-zinc-500">
                                      <IconGhost className="mr-1 inline h-3 w-3" />empty
                                    </span>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openBranchModal(workspace.name, repo.name)}
                                  className="flex h-7 w-7 items-center justify-center rounded border border-transparent text-slate-200 opacity-0 transition hover:border-blue-400/40 hover:text-blue-200 group-hover:opacity-100"
                                  aria-label={`Add worktree to ${repo.name}`}
                                >
                                  <IconPlus className="h-3.5 w-3.5" />
                                </button>
                              </div>

                              {repo.plans.length > 0 && (
                                <div className="ml-3 space-y-1 border-l border-white/10 pl-3">
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
                                <div className="ml-3 mt-1 space-y-1 border-l border-white/10 pl-3">
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
                                              handleSelectWorktree(
                                                workspace.name,
                                                repo.name,
                                                wt.name
                                              )
                                            }
                                            className={`group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-zinc-800/50 ${
                                              isActiveWorktree
                                                ? "border-l-2 border-blue-500 bg-blue-500/15 text-white"
                                                : "text-zinc-400"
                                            }`}
                                          >
                                            <span className="text-zinc-400">
                                              <IconBranch className="h-3.5 w-3.5" />
                                            </span>
                                            <span
                                              className={`font-mono text-sm ${
                                                isActiveWorktree ? "text-white" : ""
                                              }`}
                                            >
                                              {wt.name}
                                            </span>
                                            <span className="text-[10px] font-mono text-blue-400">branch</span>
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
      </aside>

      <div
        className="cursor-col-resize bg-transparent"
        style={{ width: HANDLE_WIDTH }}
        onMouseDown={startDrag}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
      />

      <section className="relative z-0 overflow-y-auto rounded-l-[24px] border-l border-white/5 bg-[#0b0b0d] p-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-mono text-zinc-400">
            {[activeWorkspace, activeRepo, activeWorktree]
              .filter(Boolean)
              .map((item, index) => (
                <div key={`${item}-${index}`} className="flex items-center gap-2">
                  {index > 0 && <span className="text-zinc-600">/</span>}
                  <span className={index === 2 ? "text-blue-300" : "text-zinc-300"}>{
                    item as string
                  }</span>
                </div>
              ))}
            {![activeWorkspace, activeRepo, activeWorktree].some(Boolean) && (
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
              Terminals: <span className="text-white">{activeWorktreeData?.terminals.length ?? 0}</span>
            </span>
          </div>
        </div>

        {!activeWorktreeData ? (
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
                      <span className="font-mono text-sm text-slate-100">{item.name}</span>
                      <span className="text-[11px] font-mono text-zinc-500">{item.context}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
              <span className="font-mono text-base text-slate-50">{activeWorktreeData.name}</span>
              <span className="text-[10px] font-mono text-blue-400">branch</span>
              <span className="text-[11px] text-zinc-400">
                {activeWorkspaceData?.name} / {activeRepoData?.name}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Terminals
                </p>
                {activeWorktreeData.terminals.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">Add a terminal to get started.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {activeWorktreeData.terminals.map((term) => (
                      <li key={term.session_id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-300">
                            <IconRepo className="h-4 w-4" />
                          </span>
                          <span className="text-slate-100">{term.name}</span>
                          <span className="text-[11px] font-mono text-zinc-500">{term.session_id}</span>
                        </div>
                        {term.dangerous && (
                          <span className="text-[10px] font-mono text-rose-300">danger</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Plans
                </p>
                {activeRepoData?.plans.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeRepoData.plans.map((plan) => (
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
        )}
      </section>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur">
          <div className="relative w-[480px] max-w-[92vw] rounded-xl border border-slate-200/10 bg-[#0b1224] p-6">
            <div className="mb-4 space-y-1">
              <h2 className="text-lg font-semibold text-slate-50">Clone repository</h2>
              <p className="text-sm text-slate-300/80">
                Enter an SSH or HTTPS address to start a new session by cloning the repo.
              </p>
            </div>
            <label className="block text-sm font-medium text-slate-200">
              Repository URL {repoTarget && <span className="text-slate-400">(target: {repoTarget})</span>}
              <input
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="git@github.com:org/repo.git or https://github.com/org/repo.git"
                className="mt-2 w-full rounded border border-slate-200/15 bg-slate-900/60 px-3 py-2.5 text-slate-100 placeholder:text-slate-400 focus:border-sky-400/70 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </label>
            {createError && <p className="mt-3 text-sm text-rose-300">{createError}</p>}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                className="rounded border border-slate-200/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-100/30 hover:bg-slate-800/60"
                onClick={() => {
                  if (!creating) {
                    setShowCreateModal(false);
                    setRepoInput("");
                    setCreateError(null);
                    setRepoTarget(null);
                  }
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateSession}
                disabled={creating}
                className="rounded border border-sky-400/60 bg-sky-500/80 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {creating ? "Creating…" : "Create session"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBranchModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur">
          <div className="relative w-[460px] max-w-[92vw] rounded-xl border border-slate-200/10 bg-[#0b1224] p-6">
            <div className="mb-4 space-y-1">
              <h2 className="text-lg font-semibold text-slate-50">Add worktree</h2>
              {branchTarget && (
                <p className="text-sm text-slate-300/80">
                  {branchTarget.workspace} / {branchTarget.repo}
                </p>
              )}
            </div>
            <label className="block text-sm font-medium text-slate-200">
              Branch name
              <input
                value={branchInput}
                onChange={(e) => setBranchInput(e.target.value)}
                placeholder="feat/my-branch"
                className="mt-2 w-full rounded border border-slate-200/15 bg-slate-900/60 px-3 py-2.5 text-slate-100 placeholder:text-slate-400 focus:border-sky-400/70 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </label>
            {branchError && <p className="mt-3 text-sm text-rose-300">{branchError}</p>}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                className="rounded border border-slate-200/20 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-100/30 hover:bg-slate-800/60"
                onClick={() => {
                  if (!creatingBranch) {
                    setShowBranchModal(false);
                    setBranchInput("");
                    setBranchError(null);
                  }
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateWorktree}
                disabled={creatingBranch}
                className="rounded border border-blue-400/60 bg-blue-500/80 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {creatingBranch ? "Creating…" : "Create worktree"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
