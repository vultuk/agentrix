/**
 * Hook for managing repository, session, and task polling
 */

import { useCallback, useEffect } from 'react';
import * as reposService from '../services/api/reposService.js';
import * as terminalService from '../services/api/terminalService.js';
import { isAuthenticationError } from '../services/api/api-client.js';

interface UsePollingEffectsOptions {
  isRealtimeConnected: boolean;
  repositoryPollInterval: number;
  sessionPollInterval: number;
  onAuthExpired?: () => void;
  onDataUpdate?: (payload: any) => void;
  onSessionsUpdate?: (sessions: any[]) => void;
  onTasksLoad?: () => void;
}

export function usePollingEffects({
  isRealtimeConnected,
  repositoryPollInterval,
  sessionPollInterval,
  onAuthExpired,
  onDataUpdate,
  onSessionsUpdate,
  onTasksLoad,
}: UsePollingEffectsOptions) {
  const refreshRepositories = useCallback(async () => {
    try {
      const payload = await reposService.fetchRepositories();
      if (onDataUpdate) {
        onDataUpdate(payload);
      }
    } catch (error: any) {
      if (isAuthenticationError(error)) {
        if (onAuthExpired) {
          onAuthExpired();
        }
        return;
      }
      console.error('Failed to load repositories', error);
    }
  }, [onDataUpdate, onAuthExpired]);

  const loadSessions = useCallback(async () => {
    try {
      const sessions = await terminalService.fetchSessions();
      if (onSessionsUpdate) {
        onSessionsUpdate(sessions);
      }
    } catch (error: any) {
      if (isAuthenticationError(error)) {
        if (onAuthExpired) {
          onAuthExpired();
        }
        return;
      }
      if (onSessionsUpdate) {
        onSessionsUpdate([]);
      }
    }
  }, [onAuthExpired, onSessionsUpdate]);

  // Initial load on mount
  useEffect(() => {
    refreshRepositories();
  }, [refreshRepositories]);

  useEffect(() => {
    if (onTasksLoad) {
      onTasksLoad();
    }
  }, [onTasksLoad]);

  // Load when reconnecting from realtime
  useEffect(() => {
    if (!isRealtimeConnected) {
      refreshRepositories();
      loadSessions();
      if (onTasksLoad) {
        onTasksLoad();
      }
    }
  }, [isRealtimeConnected, loadSessions, onTasksLoad, refreshRepositories]);

  // Repository polling when not connected to realtime
  useEffect(() => {
    if (isRealtimeConnected) {
      return () => {};
    }

    if (!repositoryPollInterval || Number.isNaN(repositoryPollInterval)) {
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

    timerId = window.setInterval(tick, repositoryPollInterval);

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
  }, [isRealtimeConnected, refreshRepositories, repositoryPollInterval]);

  // Session polling
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (isRealtimeConnected) {
      return () => {};
    }
    const id = window.setInterval(() => {
      loadSessions();
    }, sessionPollInterval);
    return () => window.clearInterval(id);
  }, [isRealtimeConnected, loadSessions, sessionPollInterval]);

  return {
    refreshRepositories,
    loadSessions,
  };
}

