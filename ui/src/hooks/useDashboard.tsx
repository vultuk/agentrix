/**
 * Hook for managing repository dashboard data, polling, and caching
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as reposService from '../services/api/reposService.js';
import { isAuthenticationError } from '../services/api/api-client.js';
import { REPOSITORY_DASHBOARD_POLL_INTERVAL_MS } from '../config/constants.js';

interface UseDashboardOptions {
  onAuthExpired?: () => void;
}

export function useDashboard({ onAuthExpired }: UseDashboardOptions = {}) {
  const [activeRepoDashboard, setActiveRepoDashboard] = useState<{ org: string; repo: string } | null>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const dashboardCacheRef = useRef(new Map<string, any>());
  const dashboardPollingRef = useRef<{ timerId: number | null; controller: AbortController | null }>({ 
    timerId: null, 
    controller: null 
  });

  const clearDashboardPolling = useCallback(() => {
    if (dashboardPollingRef.current.timerId !== null && typeof window !== 'undefined') {
      window.clearInterval(dashboardPollingRef.current.timerId);
    }
    if (dashboardPollingRef.current.controller) {
      dashboardPollingRef.current.controller.abort();
    }
    dashboardPollingRef.current = { timerId: null, controller: null };
  }, []);

  const fetchRepositoryDashboard = useCallback(
    async (org: string, repo: string, { showLoading = true } = {}) => {
      if (!org || !repo) {
        return null;
      }

      if (showLoading) {
        setIsDashboardLoading(true);
      }

      if (dashboardPollingRef.current.controller) {
        dashboardPollingRef.current.controller.abort();
      }

      const controller = new AbortController();
      dashboardPollingRef.current.controller = controller;

      try {
        const payload = await reposService.fetchRepositoryDashboard(org, repo);

        if (payload) {
          const cacheKey = `${org}::${repo}`;
          dashboardCacheRef.current.set(cacheKey, payload);
          setDashboardData(payload);
          setDashboardError(null);
        } else {
          setDashboardError('Unexpected response from server');
        }

        return payload;
      } catch (error: any) {
        if (controller.signal.aborted) {
          return null;
        }
        if (isAuthenticationError(error)) {
          if (onAuthExpired) {
            onAuthExpired();
          }
          return null;
        }
        setDashboardError(error?.message || 'Failed to load dashboard metrics');
        return null;
      } finally {
        if (dashboardPollingRef.current.controller === controller) {
          dashboardPollingRef.current.controller = null;
        }
        if (showLoading) {
          setIsDashboardLoading(false);
        }
      }
    },
    [onAuthExpired],
  );

  const refreshDashboard = useCallback(() => {
    if (!activeRepoDashboard) {
      return;
    }
    fetchRepositoryDashboard(activeRepoDashboard.org, activeRepoDashboard.repo, { showLoading: true });
  }, [activeRepoDashboard, fetchRepositoryDashboard]);

  // Effect to manage dashboard polling
  useEffect(() => {
    if (!activeRepoDashboard) {
      clearDashboardPolling();
      setIsDashboardLoading(false);
      setDashboardError(null);
      setDashboardData(null);
      return () => {};
    }

    const { org, repo } = activeRepoDashboard;
    const cacheKey = `${org}::${repo}`;
    const cached = dashboardCacheRef.current.get(cacheKey);

    if (cached) {
      setDashboardData(cached);
      setDashboardError(null);
    }

    let visibilityListenerAttached = false;

    const startPolling = () => {
      if (!REPOSITORY_DASHBOARD_POLL_INTERVAL_MS || Number.isNaN(REPOSITORY_DASHBOARD_POLL_INTERVAL_MS)) {
        return;
      }
      if (typeof window === 'undefined') {
        return;
      }
      if (dashboardPollingRef.current.timerId !== null) {
        window.clearInterval(dashboardPollingRef.current.timerId);
      }
      const timerId = window.setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          return;
        }
        fetchRepositoryDashboard(org, repo, { showLoading: false });
      }, REPOSITORY_DASHBOARD_POLL_INTERVAL_MS);
      dashboardPollingRef.current.timerId = timerId;
    };

    clearDashboardPolling();
    fetchRepositoryDashboard(org, repo, { showLoading: !cached });
    startPolling();

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined') {
        return;
      }
      if (document.visibilityState === 'hidden') {
        clearDashboardPolling();
        if (dashboardPollingRef.current.controller) {
          dashboardPollingRef.current.controller.abort();
        }
      } else {
        fetchRepositoryDashboard(org, repo, { showLoading: false });
        startPolling();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      visibilityListenerAttached = true;
    }

    return () => {
      if (visibilityListenerAttached && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      clearDashboardPolling();
    };
  }, [
    activeRepoDashboard,
    clearDashboardPolling,
    fetchRepositoryDashboard,
  ]);

  return {
    activeRepoDashboard,
    setActiveRepoDashboard,
    dashboardData,
    setDashboardData,
    dashboardError,
    setDashboardError,
    isDashboardLoading,
    setIsDashboardLoading,
    dashboardCacheRef,
    dashboardPollingRef,
    clearDashboardPolling,
    refreshDashboard,
    fetchRepositoryDashboard,
  };
}

