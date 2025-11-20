import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Button } from "../components/Button";
import { DetailsPanel } from "../components/DetailsPanel";
import { Modal } from "../components/Modal";
import { ResizeHandle } from "../components/ResizeHandle";
import { Sidebar } from "../components/Sidebar";
import { cloneSession, createWorktree } from "../lib/api";
import { useSessions } from "../hooks/useSessions";
import { SessionRepository, SessionWorkspace, SessionWorktree } from "../types/sessions";

const HANDLE_WIDTH = 5;

type Selection = {
  workspace: string | null;
  repo: string | null;
  worktree: string | null;
};

export default function Home() {
  const [sidebarWidth, setSidebarWidth] = useState(320);
  const dragging = useRef(false);
  const { sessions, loading, error, refresh } = useSessions();
  const [accordionOpen, setAccordionOpen] = useState<Record<string, boolean>>({});

  const [selection, setSelection] = useState<Selection>({
    workspace: null,
    repo: null,
    worktree: null,
  });

  const [repoModal, setRepoModal] = useState({
    open: false,
    target: null as string | null,
    value: "",
    error: null as string | null,
    creating: false,
  });

  const [branchModal, setBranchModal] = useState({
    open: false,
    target: null as { workspace: string; repo: string } | null,
    value: "",
    error: null as string | null,
    creating: false,
  });

  useEffect(() => {
    const handleMove = (event: globalThis.MouseEvent) => {
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

  useEffect(() => {
    if (sessions.length === 0) {
      setSelection({ workspace: null, repo: null, worktree: null });
      return;
    }

    const nextWorkspace =
      sessions.find((w) => w.name === selection.workspace) ?? sessions[0];
    const nextRepo =
      nextWorkspace.repositories.find((r) => r.name === selection.repo) ??
      nextWorkspace.repositories[0] ??
      null;

    let nextWorktree = selection.worktree;
    if (nextWorktree && !nextRepo?.worktrees.find((wt) => wt.name === nextWorktree)) {
      nextWorktree = nextRepo?.worktrees[0]?.name ?? null;
    }

    setSelection((prev) => {
      const updated = {
        workspace: nextWorkspace?.name ?? null,
        repo: nextRepo?.name ?? null,
        worktree: nextWorktree,
      };

      if (
        prev.workspace === updated.workspace &&
        prev.repo === updated.repo &&
        prev.worktree === updated.worktree
      ) {
        return prev;
      }

      return updated;
    });

    setAccordionOpen((prev) => {
      const next = { ...prev } as Record<string, boolean>;
      sessions.forEach((w) => {
        if (next[w.name] === undefined) {
          next[w.name] = w.name === nextWorkspace.name;
        }
      });
      next[nextWorkspace.name] = true;
      return next;
    });
  }, [sessions, selection.workspace, selection.repo, selection.worktree]);

  const startDrag = (event: ReactMouseEvent) => {
    event.preventDefault();
    dragging.current = true;
  };

  const handleSelectWorkspace = (workspaceName: string) => {
    const workspace = sessions.find((w) => w.name === workspaceName);
    if (!workspace) return;
    const firstRepo = workspace.repositories[0];
    setSelection({ workspace: workspaceName, repo: firstRepo?.name ?? null, worktree: null });
    setAccordionOpen((prev) => ({ ...prev, [workspaceName]: true }));
  };

  const handleSelectRepo = (workspaceName: string, repoName: string) => {
    const workspace = sessions.find((w) => w.name === workspaceName);
    const repo = workspace?.repositories.find((r) => r.name === repoName);
    if (!workspace || !repo) return;
    setSelection({ workspace: workspaceName, repo: repoName, worktree: null });
    setAccordionOpen((prev) => ({ ...prev, [workspaceName]: true }));
  };

  const handleSelectWorktree = (workspaceName: string, repoName: string, worktreeName: string) => {
    setSelection({ workspace: workspaceName, repo: repoName, worktree: worktreeName });
    setAccordionOpen((prev) => ({ ...prev, [workspaceName]: true }));
  };

  const toggleWorkspaceOpen = (workspaceName: string) => {
    setAccordionOpen((prev) => ({ ...prev, [workspaceName]: !prev[workspaceName] }));
  };

  const openRepoModal = (workspaceName: string) => {
    setRepoModal({ open: true, target: workspaceName, value: "", error: null, creating: false });
  };

  const openBranchModal = (workspaceName: string, repoName: string) => {
    setBranchModal({
      open: true,
      target: { workspace: workspaceName, repo: repoName },
      value: "",
      error: null,
      creating: false,
    });
  };

  const handleCreateSession = async () => {
    if (!repoModal.value.trim()) {
      setRepoModal((prev) => ({ ...prev, error: "Repository URL is required." }));
      return;
    }

    try {
      setRepoModal((prev) => ({ ...prev, creating: true, error: null }));
      await cloneSession(repoModal.value.trim());
      await refresh();
      setRepoModal({ open: false, target: null, value: "", error: null, creating: false });
    } catch (err) {
      setRepoModal((prev) => ({
        ...prev,
        error: (err as Error).message || "Could not create session.",
        creating: false,
      }));
    }
  };

  const handleCreateWorktree = async () => {
    if (!branchModal.target) {
      setBranchModal((prev) => ({ ...prev, error: "Choose a repository first." }));
      return;
    }
    if (!branchModal.value.trim()) {
      setBranchModal((prev) => ({ ...prev, error: "Branch name is required." }));
      return;
    }

    try {
      setBranchModal((prev) => ({ ...prev, creating: true, error: null }));
      await createWorktree(
        branchModal.target.workspace,
        branchModal.target.repo,
        branchModal.value.trim()
      );
      await refresh();
      setBranchModal({ open: false, target: null, value: "", error: null, creating: false });
      setSelection({
        workspace: branchModal.target.workspace,
        repo: branchModal.target.repo,
        worktree: branchModal.value.trim(),
      });
    } catch (err) {
      setBranchModal((prev) => ({
        ...prev,
        error: (err as Error).message || "Could not create worktree.",
        creating: false,
      }));
    }
  };

  const activeWorkspace: SessionWorkspace | null = useMemo(
    () => sessions.find((w) => w.name === selection.workspace) ?? null,
    [sessions, selection.workspace]
  );
  const activeRepo: SessionRepository | null = useMemo(
    () => activeWorkspace?.repositories.find((r) => r.name === selection.repo) ?? null,
    [activeWorkspace, selection.repo]
  );
  const activeWorktree: SessionWorktree | null = useMemo(
    () => activeRepo?.worktrees.find((wt) => wt.name === selection.worktree) ?? null,
    [activeRepo, selection.worktree]
  );

  return (
    <main
      className="grid h-screen min-h-screen overflow-visible bg-zinc-900 text-slate-200"
      style={{ gridTemplateColumns: `${sidebarWidth}px ${HANDLE_WIDTH}px 1fr` }}
    >
      <Sidebar
        sessions={sessions}
        loading={loading}
        error={error}
        activeWorkspace={selection.workspace}
        activeRepo={selection.repo}
        activeWorktree={selection.worktree}
        accordionOpen={accordionOpen}
        onSelectWorkspace={handleSelectWorkspace}
        onSelectRepo={handleSelectRepo}
        onSelectWorktree={handleSelectWorktree}
        onToggleWorkspace={toggleWorkspaceOpen}
        onAddRepository={openRepoModal}
        onAddWorktree={openBranchModal}
      />

      <ResizeHandle width={HANDLE_WIDTH} onMouseDown={startDrag} />

      <section className="relative z-0 overflow-y-auto rounded-l-[24px] border-l border-white/5 bg-[#0b0b0d] p-7 shadow-[-14px_0_32px_-18px_rgba(0,0,0,0.8)]">
        <div
          className="pointer-events-none absolute inset-y-0 left-[-12px] w-10 bg-gradient-to-r from-black/60 via-black/30 to-transparent"
          aria-hidden="true"
        />
        <DetailsPanel
          activeWorkspace={activeWorkspace}
          activeRepo={activeRepo}
          activeWorktree={activeWorktree}
        />
      </section>

      {repoModal.open && (
        <Modal
          title="Clone repository"
          description={
            repoModal.target ? `Target workspace: ${repoModal.target}` : "Enter an SSH or HTTPS address to start a new session by cloning the repo."
          }
          onClose={() => {
            if (!repoModal.creating) {
              setRepoModal({ open: false, target: null, value: "", error: null, creating: false });
            }
          }}
          actions={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!repoModal.creating) {
                    setRepoModal({ open: false, target: null, value: "", error: null, creating: false });
                  }
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleCreateSession} disabled={repoModal.creating}>
                {repoModal.creating ? "Creating…" : "Create session"}
              </Button>
            </>
          }
        >
          <label className="block text-sm font-medium text-slate-200">
            Repository URL
            <input
              value={repoModal.value}
              onChange={(e) => setRepoModal((prev) => ({ ...prev, value: e.target.value }))}
              placeholder="git@github.com:org/repo.git or https://github.com/org/repo.git"
              className="mt-2 w-full rounded border border-slate-200/15 bg-slate-900/60 px-3 py-2.5 text-slate-100 placeholder:text-slate-400 focus:border-sky-400/70 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          {repoModal.error && <p className="text-sm text-rose-300">{repoModal.error}</p>}
        </Modal>
      )}

      {branchModal.open && (
        <Modal
          title="Add worktree"
          description={
            branchModal.target
              ? `${branchModal.target.workspace} / ${branchModal.target.repo}`
              : "Choose a repository"
          }
          onClose={() => {
            if (!branchModal.creating) {
              setBranchModal({ open: false, target: null, value: "", error: null, creating: false });
            }
          }}
          actions={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  if (!branchModal.creating) {
                    setBranchModal({ open: false, target: null, value: "", error: null, creating: false });
                  }
                }}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleCreateWorktree} disabled={branchModal.creating}>
                {branchModal.creating ? "Creating…" : "Create worktree"}
              </Button>
            </>
          }
        >
          <label className="block text-sm font-medium text-slate-200">
            Branch name
            <input
              value={branchModal.value}
              onChange={(e) => setBranchModal((prev) => ({ ...prev, value: e.target.value }))}
              placeholder="feat/my-branch"
              className="mt-2 w-full rounded border border-slate-200/15 bg-slate-900/60 px-3 py-2.5 text-slate-100 placeholder:text-slate-400 focus:border-sky-400/70 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </label>
          {branchModal.error && <p className="text-sm text-rose-300">{branchModal.error}</p>}
        </Modal>
      )}
    </main>
  );
}
