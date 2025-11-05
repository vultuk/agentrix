/**
 * Hook for processing pending worktree creation tasks
 */

import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { Worktree } from '../../../types/domain.js';

interface UsePendingTaskProcessorOptions {
  getWorktreeKey: (org: string, repo: string, branch: string) => string;
  getCommandForLaunch: (action: string, dangerousMode?: boolean) => string | undefined;
  sessionMapRef: MutableRefObject<Map<string, string>>;
  knownSessionsRef: MutableRefObject<Set<string>>;
  openTerminalForWorktreeRef: MutableRefObject<((worktree: Worktree, options?: any) => Promise<any>) | null>;
  activeWorktreeRef: MutableRefObject<Worktree | null>;
  clearDashboardPolling: () => void;
  setActiveRepoDashboard: (value: any) => void;
  setDashboardError: (value: any) => void;
  setIsDashboardLoading: (value: boolean) => void;
  setActiveWorktree: (worktree: Worktree | null) => void;
  setPendingWorktreeAction: (worktree: Worktree | null) => void;
  setIsMobileMenuOpen: (value: boolean) => void;
  closePromptModal: () => void;
  closeWorktreeModal: () => void;
  pendingLaunchesRef?: MutableRefObject<Map<string, any>>;
}

export function usePendingTaskProcessor({
  getWorktreeKey,
  getCommandForLaunch,
  sessionMapRef,
  knownSessionsRef,
  openTerminalForWorktreeRef,
  activeWorktreeRef,
  clearDashboardPolling,
  setActiveRepoDashboard,
  setDashboardError,
  setIsDashboardLoading,
  setActiveWorktree,
  setPendingWorktreeAction,
  setIsMobileMenuOpen,
  closePromptModal,
  closeWorktreeModal,
  pendingLaunchesRef,
}: UsePendingTaskProcessorOptions) {
  const processPendingTask = useCallback(
    (task: any, pendingMetadata?: any) => {
      if (!task || typeof task !== 'object' || !task.id) {
        return;
      }
      const pending =
        pendingMetadata || (pendingLaunchesRef ? pendingLaunchesRef.current.get(task.id) : null);
      if (!pending) {
        return;
      }
      if (task.removed) {
        if (pendingLaunchesRef) {
          pendingLaunchesRef.current.delete(task.id);
        }
        return;
      }
      if (task.status === 'failed') {
        if (pendingLaunchesRef) {
          pendingLaunchesRef.current.delete(task.id);
        }
        const message =
          (task.error && typeof task.error.message === 'string' && task.error.message) ||
          'Worktree creation failed. Check server logs for details.';
        console.error('Worktree task failed', task.error || message);
        window.alert(`Worktree creation failed: ${message}`);
        return;
      }
      if (task.status !== 'succeeded') {
        return;
      }

      if (pendingLaunchesRef) {
        pendingLaunchesRef.current.delete(task.id);
      }

      const openTerminal = openTerminalForWorktreeRef.current;
      if (typeof openTerminal !== 'function') {
        return;
      }

      const branchCandidates = [
        task?.result && typeof task.result.branch === 'string' ? task.result.branch.trim() : '',
        task?.metadata && typeof task.metadata.branch === 'string' ? task.metadata.branch.trim() : '',
        pending.requestedBranch ? pending.requestedBranch.trim() : '',
      ];
      const resolvedBranch = branchCandidates.find((value) => value);
      if (!resolvedBranch) {
        window.alert('Worktree creation completed but branch name could not be determined.');
        return;
      }

      const worktree: Worktree = {
        org: pending.org,
        repo: pending.repo,
        branch: resolvedBranch,
      };

      const previousActive = activeWorktreeRef.current;

      setActiveRepoDashboard(null);
      clearDashboardPolling();
      setDashboardError(null);
      setIsDashboardLoading(false);
      setActiveWorktree(worktree);

      const worktreeKey = getWorktreeKey(worktree.org, worktree.repo, worktree.branch);
      const hasKnownSession =
        sessionMapRef.current.has(worktreeKey) || knownSessionsRef.current.has(worktreeKey);

      const resolvedCommand =
        pending.kind === 'prompt'
          ? pending.command
          : hasKnownSession
          ? null
          : getCommandForLaunch(pending.launchOption, pending.dangerousMode);

      void (async () => {
        try {
          if (pending.kind === 'prompt') {
            await openTerminal(worktree, {
              command: pending.command,
              prompt: pending.promptValue,
            });
          } else if (resolvedCommand) {
            await openTerminal(worktree, { command: resolvedCommand });
          } else {
            await openTerminal(worktree);
          }
          setPendingWorktreeAction(null);
        } catch (error: any) {
          if (error && error.message === 'AUTH_REQUIRED') {
            setActiveWorktree(previousActive || null);
            return;
          }
          if (pending.kind === 'prompt') {
            console.error('Failed to launch prompt workspace', error);
            window.alert('Failed to launch the selected agent. Check server logs for details.');
            setPendingWorktreeAction(worktree);
          } else if (hasKnownSession) {
            window.alert('Failed to reconnect to the existing session.');
          } else {
            console.error('Failed to launch the selected option', error);
            window.alert('Failed to launch the selected option. Check server logs for details.');
            setPendingWorktreeAction(worktree);
          }
          setActiveWorktree(previousActive || null);
          return;
        }

        if (pending.kind === 'prompt') {
          closePromptModal();
        } else {
          closeWorktreeModal();
        }
        setIsMobileMenuOpen(false);
      })();
    }, [
      getWorktreeKey,
      getCommandForLaunch,
      sessionMapRef,
      knownSessionsRef,
      openTerminalForWorktreeRef,
      activeWorktreeRef,
      clearDashboardPolling,
      setActiveRepoDashboard,
      setDashboardError,
      setIsDashboardLoading,
      setActiveWorktree,
      setPendingWorktreeAction,
      setIsMobileMenuOpen,
      closePromptModal,
      closeWorktreeModal,
    ]);

  return {
    processPendingTask,
  };
}
