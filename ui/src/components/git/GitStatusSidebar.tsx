import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Resizable } from 're-resizable';
import GitStatusPanel from './GitStatusPanel.js';
import { useGitStatus } from '../../hooks/useGitStatus.js';

const DEFAULT_SECTION_VISIBILITY = Object.freeze({
  conflicts: true,
  staged: true,
  unstaged: true,
  untracked: false,
  commits: false,
});

const SIDEBAR_WIDTH_STORAGE_KEY = 'terminal-worktree:git-sidebar-width';
const DEFAULT_DESKTOP_WIDTH = 360;
const MIN_DESKTOP_WIDTH = 320;
const MAX_DESKTOP_WIDTH = 720;

function readStoredWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_DESKTOP_WIDTH;
  
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return DEFAULT_DESKTOP_WIDTH;
    
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, MIN_DESKTOP_WIDTH), MAX_DESKTOP_WIDTH) : DEFAULT_DESKTOP_WIDTH;
  } catch {
    return DEFAULT_DESKTOP_WIDTH;
  }
}

interface Worktree {
  org: string;
  repo: string;
  branch: string;
}

interface GitStatusSidebarProps {
  isOpen: boolean;
  worktree: Worktree | null;
  onClose: () => void;
  onAuthExpired?: () => void;
  onOpenDiff?: (file: unknown, category?: string) => void;
  pollInterval?: number;
  entryLimit?: number;
  commitLimit?: number;
}

export default function GitStatusSidebarRefactored({
  isOpen,
  worktree,
  onClose,
  onAuthExpired,
  onOpenDiff,
  pollInterval = 6000,
  entryLimit,
  commitLimit,
}: GitStatusSidebarProps) {
  const [sections, setSections] = useState(DEFAULT_SECTION_VISIBILITY);
  const [width, setWidth] = useState(() => readStoredWidth());
  const persistedWidthRef = useRef(width);

  const { status, loadState, error, fetchStatus } = useGitStatus({
    org: worktree?.org || null,
    repo: worktree?.repo || null,
    branch: worktree?.branch || null,
    enabled: isOpen,
    pollInterval,
    entryLimit,
    commitLimit,
    onAuthExpired,
  });

  // Reset sections when worktree changes
  useEffect(() => {
    setSections(DEFAULT_SECTION_VISIBILITY);
  }, [worktree?.org, worktree?.repo, worktree?.branch]);

  // Persist width changes
  const handleResizeStop = useCallback((e: unknown, direction: unknown, ref: HTMLElement, d: { width: number }) => {
    const newWidth = width + d.width;
    const clamped = Math.min(Math.max(newWidth, MIN_DESKTOP_WIDTH), MAX_DESKTOP_WIDTH);
    setWidth(clamped);
    
    if (persistedWidthRef.current !== clamped) {
      persistedWidthRef.current = clamped;
      try {
        window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
      } catch (error) {
        console.warn('Failed to persist sidebar width', error);
      }
    }
  }, [width]);

  const toggleSection = useCallback((key: string) => {
    setSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleFileDiffRequest = useCallback((category: string, file: unknown) => {
    if (onOpenDiff) {
      onOpenDiff(file, category);
    }
  }, [onOpenDiff]);

  if (!isOpen) {
    return null;
  }

  // Desktop view
  const desktopSidebar = (
    <Resizable
      size={{ width, height: '100%' }}
      onResizeStop={handleResizeStop}
      enable={{ left: true }}
      minWidth={MIN_DESKTOP_WIDTH}
      maxWidth={MAX_DESKTOP_WIDTH}
      className="hidden lg:block border-l border-neutral-800 bg-neutral-900"
    >
      <aside className="flex h-full min-h-0 flex-col">
        <GitStatusPanel
          status={status}
          loadState={loadState}
          error={error}
          sections={sections}
          toggleSection={toggleSection}
          handleFileDiffRequest={handleFileDiffRequest}
          fetchStatus={fetchStatus}
        />
      </aside>
    </Resizable>
  );

  // Mobile view
  const mobileSidebar = (
    <div className="lg:hidden fixed inset-0 z-30">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-md bg-neutral-900 shadow-xl">
        <aside className="flex h-full min-h-0 flex-col">
          <GitStatusPanel
            status={status}
            loadState={loadState}
            error={error}
            sections={sections}
            toggleSection={toggleSection}
            handleFileDiffRequest={handleFileDiffRequest}
            fetchStatus={fetchStatus}
          />
        </aside>
      </div>
    </div>
  );

  return (
    <>
      {desktopSidebar}
      {mobileSidebar}
    </>
  );
}

