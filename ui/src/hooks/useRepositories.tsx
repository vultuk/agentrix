/**
 * Custom hook for managing repository list and polling
 */

import { useState, useEffect, useCallback } from 'react';
import { usePolling } from './usePolling.js';
import { REPOSITORY_POLL_INTERVAL_MS } from '../config/constants.js';

interface RepositoryData {
  [org: string]: {
    [repo: string]: {
      initCommand?: string;
      [key: string]: unknown;
    };
  };
}

interface UseRepositoriesOptions {
  onAuthExpired?: () => void;
}

export function useRepositories({ onAuthExpired }: UseRepositoriesOptions = {}) {
  const [data, setData] = useState<RepositoryData>({});

  const notifyAuthExpired = useCallback(() => {
    if (typeof onAuthExpired === 'function') {
      onAuthExpired();
    }
  }, [onAuthExpired]);

  const refreshRepositories = useCallback(async () => {
    try {
      const response = await fetch('/api/repos', { credentials: 'include' });
      if (response.status === 401) {
        notifyAuthExpired();
        return;
      }
      if (!response.ok) {
        console.error('Failed to fetch repositories:', response.statusText);
        return;
      }
      const result = await response.json();
      if (result && typeof result === 'object') {
        setData(result);
      }
    } catch (error) {
      console.error('Error fetching repositories:', error);
    }
  }, [notifyAuthExpired]);

  // Initial load
  useEffect(() => {
    refreshRepositories();
  }, [refreshRepositories]);

  // Use generic polling hook
  usePolling(refreshRepositories, REPOSITORY_POLL_INTERVAL_MS);

  return {
    data,
    refreshRepositories,
  };
}

