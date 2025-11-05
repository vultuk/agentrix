/**
 * Hook for managing repository data, normalization, and updates
 */

import { useCallback, useEffect, useState } from 'react';
import * as reposService from '../services/api/reposService.js';
import { isAuthenticationError } from '../services/api/api-client.js';
import { REPOSITORY_POLL_INTERVAL_MS } from '../config/constants.js';

interface RepositoryData {
  [org: string]: {
    [repo: string]: {
      branches: string[];
      initCommand: string;
    };
  };
}

interface Worktree {
  org: string;
  repo: string;
  branch: string;
}

interface UseRepositoryDataOptions {
  onAuthExpired?: () => void;
  onSessionRemoved?: (key: string) => void;
  sessionMapRef?: React.MutableRefObject<Map<string, string>>;
  sessionKeyByIdRef?: React.MutableRefObject<Map<string, string>>;
  isRealtimeConnected?: boolean;
  setActiveRepoDashboard?: (value: { org: string; repo: string } | null | ((current: { org: string; repo: string } | null) => { org: string; repo: string } | null)) => void;
}

export function useRepositoryData({ 
  onAuthExpired, 
  onSessionRemoved,
  sessionMapRef,
  sessionKeyByIdRef,
  isRealtimeConnected = false,
  setActiveRepoDashboard
}: UseRepositoryDataOptions = {}) {
  const [data, setData] = useState<RepositoryData>({});
  const [activeWorktree, setActiveWorktree] = useState<Worktree | null>(null);

  const normaliseRepositoryPayload = useCallback((payload: any): RepositoryData => {
    if (!payload || typeof payload !== 'object') {
      return {};
    }
    return Object.fromEntries(
      Object.entries(payload).map(([org, repos]) => {
        const repoMap = Object.entries(repos || {}).map(([repo, value]) => {
          const repoInfo = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
          const branchesSource = Array.isArray((repoInfo as any).branches) ? (repoInfo as any).branches : Array.isArray(value) ? value : [];
          const branches = branchesSource
            .filter((branch: any) => typeof branch === 'string' && branch.trim().length > 0)
            .map((branch: any) => branch.trim());
          const initCommand =
            typeof (repoInfo as any).initCommand === 'string' ? (repoInfo as any).initCommand.trim() : '';
          return [repo, { branches, initCommand }];
        });
        return [org, Object.fromEntries(repoMap)];
      }),
    );
  }, []);

  const applyDataUpdate = useCallback((payload: any) => {
    const normalised = normaliseRepositoryPayload(payload);
    setData(normalised);
    setActiveWorktree((current) => {
      if (!current) {
        return current;
      }
      const repoInfo = normalised?.[current.org]?.[current.repo] || {};
      const branches = Array.isArray(repoInfo.branches) ? repoInfo.branches : [];
      if (branches.includes(current.branch) && current.branch !== 'main') {
        return current;
      }
      return null;
    });
    
    // Clean up dashboard if repository was removed
    if (setActiveRepoDashboard) {
      setActiveRepoDashboard((current) => {
        if (!current) {
          return current;
        }
        const repoInfo = normalised?.[current.org]?.[current.repo] || {};
        const branches = Array.isArray(repoInfo.branches) ? repoInfo.branches : [];
        if (branches.includes('main')) {
          return current;
        }
        return null;
      });
    }
    
    // Clean up sessions for deleted worktrees
    if (sessionMapRef && sessionKeyByIdRef && onSessionRemoved) {
      sessionMapRef.current.forEach((session: string, key: string) => {
        const [orgKey, repoKey, branchKey] = key.split('::');
        const repoInfo = normalised?.[orgKey]?.[repoKey] || {};
        const branches = Array.isArray(repoInfo.branches) ? repoInfo.branches : [];
        if (!branches.includes(branchKey)) {
          sessionMapRef.current.delete(key);
          sessionKeyByIdRef.current.delete(session);
          onSessionRemoved(key);
        }
      });
    }
  }, [normaliseRepositoryPayload, sessionMapRef, sessionKeyByIdRef, onSessionRemoved, setActiveRepoDashboard]);

  const refreshRepositories = useCallback(async () => {
    try {
      const payload = await reposService.fetchRepositories();
      applyDataUpdate(payload);
    } catch (error: any) {
      if (isAuthenticationError(error)) {
        if (onAuthExpired) {
          onAuthExpired();
        }
        return;
      }
      console.error('Failed to load repositories', error);
    }
  }, [applyDataUpdate, onAuthExpired]);

  const getRepoInitCommandValue = useCallback((org: string, repo: string): string => {
    const repoInfo = data?.[org]?.[repo];
    if (repoInfo && typeof repoInfo.initCommand === 'string') {
      return repoInfo.initCommand;
    }
    return '';
  }, [data]);

  // Initial load
  useEffect(() => {
    refreshRepositories();
  }, [refreshRepositories]);

  // Polling effect (only when not realtime connected)
  useEffect(() => {
    if (isRealtimeConnected) {
      return () => {};
    }

    if (!REPOSITORY_POLL_INTERVAL_MS || Number.isNaN(REPOSITORY_POLL_INTERVAL_MS)) {
      return () => {};
    }

    let timerId: number | null = null;
    let cancelled = false;
    let inFlight = false;

    const isDocumentVisible = () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden';

    const tick = () => {
      if (cancelled || inFlight || !isDocumentVisible()) {
        return;
      }
      inFlight = true;
      refreshRepositories()
        .catch(() => {})
        .finally(() => {
          inFlight = false;
        });
    };

    timerId = window.setInterval(tick, REPOSITORY_POLL_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (isDocumentVisible()) {
        tick();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearInterval(timerId);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [isRealtimeConnected, refreshRepositories]);

  return {
    data,
    setData,
    activeWorktree,
    setActiveWorktree,
    refreshRepositories,
    applyDataUpdate,
    getRepoInitCommandValue,
  };
}

