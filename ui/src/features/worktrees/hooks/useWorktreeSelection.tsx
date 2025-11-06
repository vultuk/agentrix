/**
 * Hook for handling worktree selection and issue plan modal logic
 */

import { useCallback } from 'react';
import { createIdleAcknowledgementEntry, getMetadataLastActivityMs } from '../../../utils/activity.js';
import type { Worktree, RepoDashboard } from '../../../types/domain.js';

interface UseWorktreeSelectionOptions {
  getWorktreeKey: (org: string, repo: string, branch: string) => string;
  sessionMapRef: React.MutableRefObject<Map<string, string>>;
  knownSessionsRef: React.MutableRefObject<Set<string>>;
  sessionMetadataRef: React.MutableRefObject<Map<string, any>>;
  idleAcknowledgementsRef: React.MutableRefObject<Map<string, any>>;
  dashboardCacheRef: React.MutableRefObject<Map<string, any>>;
  clearDashboardPolling: () => void;
  setPendingWorktreeAction: (worktree: Worktree | null) => void;
  setActiveWorktree: (worktree: Worktree | null) => void;
  setActiveRepoDashboard: (value: RepoDashboard | null) => void;
  setDashboardData: (data: any) => void;
  setDashboardError: (error: string | null) => void;
  setIsDashboardLoading: (loading: boolean) => void;
  setIdleAcknowledgementsSnapshot: (snapshot: Map<string, any>) => void;
  setIsMobileMenuOpen: (value: boolean) => void;
  disposeSocket: () => void;
  disposeTerminal: () => void;
  closeGitSidebar: () => void;
  closePortsSidebar: () => void;
  loadSessions: () => Promise<void>;
  openTerminalForWorktree: (worktree: Worktree, options?: any) => Promise<void>;
}

export function useWorktreeSelection({
  getWorktreeKey,
  sessionMapRef,
  knownSessionsRef,
  sessionMetadataRef,
  idleAcknowledgementsRef,
  dashboardCacheRef,
  clearDashboardPolling,
  setPendingWorktreeAction,
  setActiveWorktree,
  setActiveRepoDashboard,
  setDashboardData,
  setDashboardError,
  setIsDashboardLoading,
  setIdleAcknowledgementsSnapshot,
  setIsMobileMenuOpen,
  disposeSocket,
  disposeTerminal,
  closeGitSidebar,
  closePortsSidebar,
  loadSessions,
  openTerminalForWorktree,
}: UseWorktreeSelectionOptions) {
  const handleWorktreeSelection = useCallback(
    async (org: string, repo: string, branch: string) => {
      if (branch === 'main') {
        clearDashboardPolling();
        setPendingWorktreeAction(null);
        setActiveWorktree(null);
        disposeSocket();
        disposeTerminal();
        closeGitSidebar();
        closePortsSidebar();
        const cacheKey = `${org}::${repo}`;
        const cached = dashboardCacheRef.current.get(cacheKey);
        if (cached) {
          setDashboardData(cached);
          setDashboardError(null);
          setIsDashboardLoading(false);
        } else {
          setDashboardData(null);
          setIsDashboardLoading(true);
        }
        setActiveRepoDashboard({ org, repo });
        setIsMobileMenuOpen(false);
        return;
      }

      clearDashboardPolling();
      setActiveRepoDashboard(null);
      setDashboardError(null);
      setIsDashboardLoading(false);

      const worktree = { org, repo, branch };
      const key = getWorktreeKey(org, repo, branch);
      if (!sessionMapRef.current.has(key) && !knownSessionsRef.current.has(key)) {
        await loadSessions();
      }
      if (sessionMapRef.current.has(key) || knownSessionsRef.current.has(key)) {
        setActiveWorktree(worktree);
        let acknowledgementSet = false;
        let previousAcknowledgement;
        const metadata = sessionMetadataRef.current.get(key);
        if (metadata && metadata.idle) {
          previousAcknowledgement = idleAcknowledgementsRef.current.has(key)
            ? idleAcknowledgementsRef.current.get(key)
            : undefined;
          const nextAcknowledgements = new Map(idleAcknowledgementsRef.current);
          nextAcknowledgements.set(
            key,
            createIdleAcknowledgementEntry(getMetadataLastActivityMs(metadata)),
          );
          idleAcknowledgementsRef.current = nextAcknowledgements;
          setIdleAcknowledgementsSnapshot(new Map(nextAcknowledgements));
          acknowledgementSet = true;
        }
        try {
          await openTerminalForWorktree(worktree);
          setPendingWorktreeAction(null);
        } catch (error: any) {
          if (acknowledgementSet) {
            const revertAcknowledgements = new Map(idleAcknowledgementsRef.current);
            if (previousAcknowledgement === undefined) {
              revertAcknowledgements.delete(key);
            } else {
              revertAcknowledgements.set(key, previousAcknowledgement);
            }
            idleAcknowledgementsRef.current = revertAcknowledgements;
            setIdleAcknowledgementsSnapshot(new Map(revertAcknowledgements));
          }
          if (error && error.message === 'AUTH_REQUIRED') {
            return;
          }
          window.alert('Failed to reconnect to the existing session.');
        }
      } else {
        setPendingWorktreeAction(worktree);
        setIsMobileMenuOpen(false);
      }
    },
    [
      clearDashboardPolling,
      closeGitSidebar,
      closePortsSidebar,
      disposeSocket,
      disposeTerminal,
      getWorktreeKey,
      loadSessions,
      openTerminalForWorktree,
      sessionMapRef,
      knownSessionsRef,
      sessionMetadataRef,
      idleAcknowledgementsRef,
      dashboardCacheRef,
      setPendingWorktreeAction,
      setActiveWorktree,
      setActiveRepoDashboard,
      setDashboardData,
      setDashboardError,
      setIsDashboardLoading,
      setIdleAcknowledgementsSnapshot,
      setIsMobileMenuOpen,
    ],
  );

  return {
    handleWorktreeSelection,
  };
}
