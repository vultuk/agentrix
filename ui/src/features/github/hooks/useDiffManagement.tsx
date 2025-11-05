/**
 * Hook for managing Git diff modal
 */

import { useCallback, useEffect } from 'react';
import * as gitService from '../../../services/api/gitService.js';
import { isAuthenticationError } from '../../../services/api/api-client.js';
import type { Worktree } from '../../../types/domain.js';

interface UseDiffManagementOptions {
  activeWorktree: Worktree | null;
  onAuthExpired?: () => void;
}

export function useDiffManagement({ activeWorktree, onAuthExpired }: UseDiffManagementOptions) {
  const resolveDefaultDiffView = useCallback((): 'split' | 'unified' => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      return 'unified';
    }
    return 'split';
  }, []);

  const openGitDiff = useCallback(
    async (
      item: any,
      setGitDiffModal: (updater: ((current: any) => any) | any) => void,
    ) => {
      if (!activeWorktree || !item || !item.path) {
        return;
      }

      const determineDiffMode = (target: any): string => {
        if (target.kind === 'staged') {
          return 'staged';
        }
        if (target.kind === 'untracked') {
          return 'untracked';
        }
        if (target.kind === 'conflict') {
          return 'unstaged';
        }
        if (target.indexStatus && target.indexStatus !== ' ') {
          return 'staged';
        }
        return 'unstaged';
      };

      const diffMode = determineDiffMode(item);
      const nextFile = {
        path: item.path,
        previousPath: item.previousPath || null,
        kind: item.kind || null,
        status: item.status || '',
        mode: diffMode,
      };

      setGitDiffModal({ 
        open: true, 
        loading: true, 
        error: null, 
        diff: '', 
        file: nextFile, 
        view: resolveDefaultDiffView() 
      });

      try {
        const payload = await gitService.fetchDiff(
          activeWorktree.org,
          activeWorktree.repo,
          activeWorktree.branch,
          item.path,
          item.previousPath || null,
          diffMode,
          item.status || ''
        );
        setGitDiffModal((current: any) => ({
          open: true,
          loading: false,
          error: null,
          diff: payload && typeof payload.diff === 'string' ? payload.diff : '',
          file: payload && typeof payload === 'object'
            ? {
                path: payload.path || nextFile.path,
                previousPath: payload.previousPath ?? nextFile.previousPath,
                kind: nextFile.kind,
                status: nextFile.status,
                mode: payload.mode || nextFile.mode,
              }
            : nextFile,
          view: current.view || resolveDefaultDiffView(),
        }));
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          if (onAuthExpired) {
            onAuthExpired();
          }
          setGitDiffModal((current: any) => ({
            ...current,
            open: false,
          }));
          return;
        }
        setGitDiffModal((current: any) => ({
          open: true,
          loading: false,
          error: error && error.message ? error.message : 'Failed to load diff',
          diff: '',
          file: current.file || nextFile,
          view: current.view || resolveDefaultDiffView(),
        }));
      }
    },
    [activeWorktree, onAuthExpired, resolveDefaultDiffView],
  );

  const toggleDiffView = useCallback((setGitDiffModal: (updater: (current: any) => any) => void) => {
    setGitDiffModal((current) => {
      if (!current.open) {
        return current;
      }
      const nextView: 'split' | 'unified' = current.view === 'split' ? 'unified' : 'split';
      return { ...current, view: nextView };
    });
  }, []);

  const closeDiffModal = useCallback((setGitDiffModal: (updater: (current: any) => any) => void) => {
    setGitDiffModal((current) => {
      if (!current.open) {
        return current;
      }
      const defaultView: 'split' | 'unified' = 'split';
      return { open: false, loading: false, error: null, diff: '', file: null, view: defaultView };
    });
  }, []);

  // Auto-close diff when worktree changes
  const autoCloseDiff = useCallback((setGitDiffModal: (updater: (current: any) => any) => void) => {
    closeDiffModal(setGitDiffModal);
  }, [closeDiffModal]);

  return {
    openGitDiff,
    toggleDiffView,
    closeDiffModal,
    autoCloseDiff,
    resolveDefaultDiffView,
  };
}

