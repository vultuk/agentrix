import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ChevronDown,
  RefreshCcw,
  XCircle,
} from 'lucide-react';

const AUTO_REFRESH_INTERVAL_MS = 6000;
const LARGE_SECTION_THRESHOLD = 25;

const DEFAULT_SECTION_VISIBILITY = Object.freeze({
  conflicts: true,
  staged: true,
  unstaged: true,
  untracked: false,
  commits: false,
});

function formatCount(value) {
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (value > 999) {
    return '999+';
  }
  return String(value);
}

function formatTimestamp(value) {
  if (!value) {
    return null;
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
      return null;
    }
    return new Intl.DateTimeFormat(undefined, {
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    }).format(date);
  } catch {
    return null;
  }
}

function SectionHeaderButton({
  id,
  title,
  count,
  open,
  onToggle,
  tone = 'neutral',
  truncated = false,
}) {
  const toneMap = {
    neutral: 'text-neutral-300',
    warning: 'text-amber-200',
    danger: 'text-rose-200',
    success: 'text-emerald-200',
    info: 'text-sky-200',
  };

  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm font-medium text-neutral-200 transition hover:bg-neutral-900/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500/60"
      aria-expanded={open ? 'true' : 'false'}
    >
      <span className={`flex items-center gap-2 ${toneMap[tone] || toneMap.neutral}`}>
        <span>{title}</span>
        <span className="rounded-full border border-current/40 px-1.5 py-[1px] text-[11px] font-semibold uppercase tracking-wide">
          {formatCount(count)}
          {truncated ? '+' : ''}
        </span>
      </span>
      <ChevronDown
        size={14}
        className={`text-neutral-500 transition-transform duration-200 ${open ? '-rotate-180' : 'rotate-0'}`}
      />
    </button>
  );
}

function ChangeList({ items, emptyLabel, kind }) {
  if (!items || items.length === 0) {
    return (
      <p className="px-3 py-3 text-xs text-neutral-500">{emptyLabel}</p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-800">
      {items.map((item) => {
        const key = `${item.path || ''}:${item.previousPath || ''}:${item.status || ''}:${item.kind || ''}`;
        return (
          <li key={key} className="px-3 py-2">
            <div className="min-w-0 text-sm">
              <p className="truncate text-neutral-200" title={item.path}>
                {item.path}
              </p>
              {item.previousPath ? (
                <p className="truncate text-[11px] uppercase tracking-wide text-neutral-500" title={item.previousPath}>
                  from {item.previousPath}
                </p>
              ) : null}
              {item.description ? (
                <p className="text-[11px] uppercase tracking-wide text-neutral-500/80">
                  {item.description}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CommitsList({ commits }) {
  if (!commits || commits.items.length === 0) {
    return (
      <p className="px-3 py-3 text-xs text-neutral-500">No recent commits for this branch.</p>
    );
  }

  return (
    <Fragment>
      <ul className="divide-y divide-neutral-800">
        {commits.items.map((commit) => (
          <li key={commit.hash} className="px-3 py-2 text-sm">
            <p className="text-neutral-200">
              <span className="font-semibold">{commit.subject}</span>
            </p>
            <p className="text-xs text-neutral-500">{commit.hash.slice(0, 7)} · {commit.author} · {commit.relativeTime}</p>
          </li>
        ))}
      </ul>
      {commits.truncated ? (
        <p className="px-3 pb-3 pt-2 text-[11px] text-neutral-500">
          Showing first {formatCount(commits.items.length)} of {formatCount(commits.total)} commits.
        </p>
      ) : null}
    </Fragment>
  );
}

export default function GitStatusSidebar({
  isOpen,
  worktree,
  onClose,
  onAuthExpired,
  onStatusUpdate,
  pollInterval = AUTO_REFRESH_INTERVAL_MS,
  entryLimit,
  commitLimit,
}) {
  const [status, setStatus] = useState(null);
  const [loadState, setLoadState] = useState('idle');
  const [error, setError] = useState(null);
  const [sections, setSections] = useState(DEFAULT_SECTION_VISIBILITY);
  const abortRef = useRef(null);
  const initialisedRef = useRef(false);
  const worktreeKey = worktree ? `${worktree.org}/${worktree.repo}:${worktree.branch}` : null;

  useEffect(() => {
    initialisedRef.current = false;
    setSections(DEFAULT_SECTION_VISIBILITY);
    setStatus(null);
    setError(null);
    setLoadState('idle');
  }, [worktreeKey]);

  const abortInFlight = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(
    async ({ silent = false } = {}) => {
      if (!worktree) {
        return;
      }

      const controller = new AbortController();
      abortInFlight();
      abortRef.current = controller;

      if (!silent || !status) {
        setLoadState('loading');
      }

      try {
        const params = new URLSearchParams({
          org: worktree.org,
          repo: worktree.repo,
          branch: worktree.branch,
        });
        if (Number.isFinite(entryLimit)) {
          params.set('entryLimit', String(entryLimit));
        }
        if (Number.isFinite(commitLimit)) {
          params.set('commitLimit', String(commitLimit));
        }

        const response = await fetch(`/api/git/status?${params.toString()}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (response.status === 401) {
          if (typeof onAuthExpired === 'function') {
            onAuthExpired();
          }
          throw new Error('Authentication required');
        }
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        const body = await response.json();
        const payload = body && typeof body === 'object' ? body.status || body : null;
        setStatus(payload);
        setError(null);
        setLoadState('ready');
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        setError(err);
        setLoadState('error');
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [abortInFlight, worktree, status, entryLimit, commitLimit, onAuthExpired],
  );

  useEffect(() => {
    if (!isOpen) {
      abortInFlight();
      return;
    }
    fetchStatus({ silent: false });
  }, [isOpen, fetchStatus, abortInFlight, worktreeKey]);

  useEffect(() => {
    if (!isOpen || !worktree) {
      return () => {};
    }

    const isDocumentVisible = () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden';

    const intervalId = window.setInterval(() => {
      if (isDocumentVisible()) {
        fetchStatus({ silent: true });
      }
    }, pollInterval);

    const handleVisibilityChange = () => {
      if (isDocumentVisible()) {
        fetchStatus({ silent: true });
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      window.clearInterval(intervalId);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [isOpen, pollInterval, fetchStatus, worktree]);

  useEffect(() => () => abortInFlight(), [abortInFlight]);

  useEffect(() => {
    if (!status || initialisedRef.current) {
      return;
    }

    const next = { ...DEFAULT_SECTION_VISIBILITY };
    const totals = status.files || {};
    const clampSection = (section) => {
      const total = totals[section]?.total ?? 0;
      if (total === 0) {
        next[section] = false;
      } else if (total > LARGE_SECTION_THRESHOLD) {
        next[section] = false;
      }
    };
    clampSection('conflicts');
    clampSection('staged');
    clampSection('unstaged');
    clampSection('untracked');
    if ((status.commits?.total ?? 0) > LARGE_SECTION_THRESHOLD) {
      next.commits = false;
    } else if ((status.commits?.total ?? 0) > 0) {
      next.commits = true;
    }
    setSections((current) => ({ ...current, ...next }));
    initialisedRef.current = true;
  }, [status]);

  useEffect(() => {
    if (!status || typeof onStatusUpdate !== 'function') {
      return;
    }
    onStatusUpdate({
      totals: status.totals,
      branchSummary: status.branchSummary,
      operations: status.operations,
      fetchedAt: status.fetchedAt,
    });
  }, [status, onStatusUpdate]);

  useEffect(() => {
    if (!isOpen) {
      return () => {};
    }
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (typeof onClose === 'function') {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const toggleSection = useCallback((sectionId) => {
    setSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }, []);

  const lastUpdated = formatTimestamp(status?.fetchedAt);

  const desktopPanel = (
    <div
      className={`hidden h-full flex-col border-l border-neutral-800 bg-neutral-900/95 text-neutral-100 shadow-lg transition-[width,opacity] duration-200 ease-out lg:flex lg:flex-shrink-0 lg:overflow-hidden ${
        isOpen ? 'lg:w-[360px] opacity-100' : 'pointer-events-none lg:w-0 opacity-0'
      }`}
      aria-hidden={isOpen ? 'false' : 'true'}
    >
      <aside className="flex h-full min-h-0 flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loadState === 'loading' && !status ? (
            <div className="space-y-3">
              <div className="h-4 animate-pulse rounded bg-neutral-800/70" />
              <div className="h-32 animate-pulse rounded bg-neutral-800/60" />
              <div className="h-24 animate-pulse rounded bg-neutral-800/60" />
            </div>
          ) : null}
          {loadState === 'error' ? (
            <div className="space-y-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-4 text-rose-100">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 flex-shrink-0" />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">Unable to load Git status</p>
                  <p className="text-xs text-rose-100/80">{error?.message || 'Check the server logs for additional details.'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => fetchStatus({ silent: false })}
                className="inline-flex items-center gap-2 rounded-md border border-rose-400/60 px-3 py-1 text-xs font-medium uppercase tracking-wide text-rose-50 transition hover:bg-rose-500/20"
              >
                <RefreshCcw className="h-3.5 w-3.5" /> Retry
              </button>
            </div>
          ) : null}
          {status && loadState !== 'error' ? (
            <div className="space-y-4">

              {['conflicts', 'staged', 'unstaged', 'untracked'].map((key) => {
                const fileSet = status.files?.[key];
                if (!fileSet) {
                  return null;
                }
                const titles = {
                  conflicts: 'Conflicts',
                  staged: 'Staged changes',
                  unstaged: 'Unstaged changes',
                  untracked: 'Untracked files',
                };
                const emptyLabels = {
                  conflicts: 'No merge conflicts detected.',
                  staged: 'No staged changes.',
                  unstaged: 'No unstaged changes.',
                  untracked: 'No untracked files.',
                };
                const tones = {
                  conflicts: 'danger',
                  staged: 'success',
                  unstaged: 'warning',
                  untracked: 'info',
                };
                return (
                  <section key={key} className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-925/60">
                    <SectionHeaderButton
                      id={key}
                      title={titles[key]}
                      count={fileSet.total}
                      open={Boolean(sections[key])}
                      onToggle={toggleSection}
                      tone={tones[key]}
                      truncated={Boolean(fileSet.truncated)}
                    />
                    {sections[key] ? (
                      <ChangeList
                        items={fileSet.items}
                        emptyLabel={emptyLabels[key]}
                        kind={key === 'conflicts' ? 'conflict' : key}
                      />
                    ) : null}
                  </section>
                );
              })}

              <section className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-925/60">
                <SectionHeaderButton
                  id="commits"
                  title="Recent commits"
                  count={status.commits?.total || 0}
                  open={Boolean(sections.commits)}
                  onToggle={toggleSection}
                />
                {sections.commits ? <CommitsList commits={status.commits} /> : null}
              </section>
            </div>
          ) : null}
        </div>
        <footer className="border-t border-neutral-800 px-4 py-2 text-[11px] text-neutral-500">
          {lastUpdated ? `Last updated ${lastUpdated}` : 'Awaiting first refresh…'}
        </footer>
      </aside>
    </div>
  );

  const mobilePanel = (
    <div
      className={`lg:hidden ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'} fixed inset-0 z-50 transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
      aria-hidden={isOpen ? 'false' : 'true'}
    >
      <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-200 ${isOpen ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <aside
        className={`absolute inset-y-0 right-0 flex w-[90%] max-w-sm flex-col border-l border-neutral-800 bg-neutral-900/95 text-neutral-100 shadow-xl transition-transform duration-200 ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loadState === 'loading' && !status ? (
            <div className="space-y-3">
              <div className="h-4 animate-pulse rounded bg-neutral-800/70" />
              <div className="h-32 animate-pulse rounded bg-neutral-800/60" />
              <div className="h-24 animate-pulse rounded bg-neutral-800/60" />
            </div>
          ) : null}
          {loadState === 'error' ? (
            <div className="space-y-3 rounded-md border border-rose-500/40 bg-rose-500/10 p-4 text-rose-100">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 flex-shrink-0" />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold">Unable to load Git status</p>
                  <p className="text-xs text-rose-100/80">{error?.message || 'Check the server logs for additional details.'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => fetchStatus({ silent: false })}
                className="inline-flex items-center gap-2 rounded-md border border-rose-400/60 px-3 py-1 text-xs font-medium uppercase tracking-wide text-rose-50 transition hover:bg-rose-500/20"
              >
                <RefreshCcw className="h-3.5 w-3.5" /> Retry
              </button>
            </div>
          ) : null}
          {status && loadState !== 'error' ? (
            <div className="space-y-4">

              {['conflicts', 'staged', 'unstaged', 'untracked'].map((key) => {
                const fileSet = status.files?.[key];
                if (!fileSet) {
                  return null;
                }
                const titles = {
                  conflicts: 'Conflicts',
                  staged: 'Staged changes',
                  unstaged: 'Unstaged changes',
                  untracked: 'Untracked files',
                };
                const emptyLabels = {
                  conflicts: 'No merge conflicts detected.',
                  staged: 'No staged changes.',
                  unstaged: 'No unstaged changes.',
                  untracked: 'No untracked files.',
                };
                const tones = {
                  conflicts: 'danger',
                  staged: 'success',
                  unstaged: 'warning',
                  untracked: 'info',
                };
                return (
                  <section key={key} className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-925/60">
                    <SectionHeaderButton
                      id={`${key}-mobile`}
                      title={titles[key]}
                      count={fileSet.total}
                      open={Boolean(sections[key])}
                      onToggle={() => toggleSection(key)}
                      tone={tones[key]}
                      truncated={Boolean(fileSet.truncated)}
                    />
                    {sections[key] ? (
                      <ChangeList
                        items={fileSet.items}
                        emptyLabel={emptyLabels[key]}
                        kind={key === 'conflicts' ? 'conflict' : key}
                      />
                    ) : null}
                  </section>
                );
              })}

              <section className="overflow-hidden rounded-md border border-neutral-800 bg-neutral-925/60">
                <SectionHeaderButton
                  id="commits-mobile"
                  title="Recent commits"
                  count={status.commits?.total || 0}
                  open={Boolean(sections.commits)}
                  onToggle={() => toggleSection('commits')}
                />
                {sections.commits ? <CommitsList commits={status.commits} /> : null}
              </section>
            </div>
          ) : null}
        </div>
        <footer className="border-t border-neutral-800 px-4 py-2 text-[11px] text-neutral-500">
          {lastUpdated ? `Last updated ${lastUpdated}` : 'Awaiting first refresh…'}
        </footer>
      </aside>
    </div>
  );

  return (
    <Fragment>
      {desktopPanel}
      {mobilePanel}
    </Fragment>
  );
}
