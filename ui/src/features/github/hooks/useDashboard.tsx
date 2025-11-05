/**
 * Hook for managing repository dashboard data, polling, and caching
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as reposService from '../../../services/api/reposService.js';
import { isAuthenticationError } from '../../../services/api/api-client.js';
import { REPOSITORY_DASHBOARD_POLL_INTERVAL_MS } from '../../../utils/constants.js';
import { usePolling } from '../../../hooks/usePolling.js';
import type { RepoDashboard } from '../../../types/domain.js';

interface UseDashboardOptions {
  onAuthExpired?: () => void;
}

export function useDashboard({ onAuthExpired }: UseDashboardOptions = {}) {
  const [activeRepoDashboard, setActiveRepoDashboard] = useState<RepoDashboard | null>(null);
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

  // Effect to manage dashboard data and initial fetch
  useEffect(() => {
    if (!activeRepoDashboard) {
      clearDashboardPolling();
      setIsDashboardLoading(false);
      setDashboardError(null);
      setDashboardData(null);
      return;
    }

    const { org, repo } = activeRepoDashboard;
    const cacheKey = `${org}::${repo}`;
    const cached = dashboardCacheRef.current.get(cacheKey);

    if (cached) {
      setDashboardData(cached);
      setDashboardError(null);
    }

    // Initial fetch
    fetchRepositoryDashboard(org, repo, { showLoading: !cached });
  }, [activeRepoDashboard, fetchRepositoryDashboard]);

  // Use enhanced polling hook for periodic updates
  usePolling({
    callback: useCallback(async () => {
      if (activeRepoDashboard) {
        await fetchRepositoryDashboard(activeRepoDashboard.org, activeRepoDashboard.repo, { showLoading: false });
      }
    }, [activeRepoDashboard, fetchRepositoryDashboard]),
    interval: REPOSITORY_DASHBOARD_POLL_INTERVAL_MS,
    enabled: activeRepoDashboard !== null,
    pauseWhenHidden: true,
  });

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

