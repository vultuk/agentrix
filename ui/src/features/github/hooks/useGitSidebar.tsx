/**
 * Hook for managing Git sidebar state per worktree
 */

import { useCallback, useEffect, useState } from 'react';
import type { Worktree } from '../../../types/domain.js';

export function useGitSidebar(activeWorktree: Worktree | null, getWorktreeKey: (org: string, repo: string, branch: string) => string) {
  const [gitSidebarState, setGitSidebarState] = useState<Record<string, any>>({});

  const gitSidebarKey = activeWorktree
    ? getWorktreeKey(activeWorktree.org, activeWorktree.repo, activeWorktree.branch)
    : null;
  const gitSidebarEntry = gitSidebarKey ? gitSidebarState[gitSidebarKey] : null;
  const isGitSidebarOpen = Boolean(gitSidebarEntry?.open);

  useEffect(() => {
    if (!activeWorktree) {
      return;
    }
    const key = getWorktreeKey(activeWorktree.org, activeWorktree.repo, activeWorktree.branch);
    setGitSidebarState(current => {
      if (current[key]) {
        return current;
      }
      return { ...current, [key]: { open: false, snapshot: null } };
    });
  }, [activeWorktree, getWorktreeKey]);

  const handleGitStatusUpdate = useCallback(
    (snapshot: any) => {
      if (!gitSidebarKey) {
        return;
      }
      setGitSidebarState((current) => {
        const previous = current[gitSidebarKey] || { open: false, snapshot: null };
        if (previous.snapshot && snapshot && previous.snapshot.fetchedAt === snapshot.fetchedAt) {
          return current;
        }
        return {
          ...current,
          [gitSidebarKey]: { ...previous, snapshot },
        };
      });
    },
    [gitSidebarKey],
  );

  const toggleGitSidebar = useCallback(() => {
    if (!gitSidebarKey) {
      return;
    }
    let nextOpen = false;
    setGitSidebarState((current) => {
      const previous = current[gitSidebarKey] || { open: false, snapshot: null };
      nextOpen = !previous.open;
      return {
        ...current,
        [gitSidebarKey]: { ...previous, open: nextOpen },
      };
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('agentrix:git-sidebar-toggle', {
          detail: {
            worktree: gitSidebarKey,
            open: nextOpen,
            timestamp: Date.now()
          }
        })
      );
    }
  }, [gitSidebarKey]);

  const closeGitSidebar = useCallback(() => {
    if (!gitSidebarKey) {
      return;
    }
    setGitSidebarState((current) => {
      const previous = current[gitSidebarKey] || { open: false, snapshot: null };
      if (!previous.open) {
        return current;
      }
      return {
        ...current,
        [gitSidebarKey]: { ...previous, open: false },
      };
    });
  }, [gitSidebarKey]);

  return {
    gitSidebarState,
    gitSidebarKey,
    isGitSidebarOpen,
    handleGitStatusUpdate,
    toggleGitSidebar,
    closeGitSidebar,
  };
}

