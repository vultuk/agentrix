/**
 * Hook for managing RepoBrowser UI state
 */

import { useState, useCallback, useEffect } from 'react';
import { ORGANISATION_COLLAPSE_STORAGE_KEY } from '../../../utils/constants.js';
import type { Worktree } from '../../../types/domain.js';

export function useRepoBrowserState() {
  // UI Layout state
  const [width, setWidth] = useState(340);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  
  // Pending actions
  const [pendingWorktreeAction, setPendingWorktreeAction] = useState<Worktree | null>(null);
  const [pendingActionLoading, setPendingActionLoading] = useState<string | null>(null);
  
  // Organisation collapse state (persisted to localStorage)
  const [collapsedOrganisations, setCollapsedOrganisations] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') {
      return {};
    }
    try {
      const stored = window.localStorage.getItem(ORGANISATION_COLLAPSE_STORAGE_KEY);
      if (!stored) {
        return {};
      }
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed).map(([key, value]) => [key, Boolean(value)])
        );
      }
    } catch (error: any) {
      console.warn('Failed to restore organisation collapse state', error);
    }
    return {};
  });

  // Persist collapsed organisations to localStorage
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(
        ORGANISATION_COLLAPSE_STORAGE_KEY,
        JSON.stringify(collapsedOrganisations)
      );
    } catch (error: any) {
      console.warn('Failed to persist organisation collapse state', error);
    }
  }, [collapsedOrganisations]);

  const toggleOrganisationCollapsed = useCallback((org: string) => {
    setCollapsedOrganisations((current) => {
      const next = { ...current };
      if (next[org]) {
        delete next[org];
      } else {
        next[org] = true;
      }
      return next;
    });
  }, []);

  const getWorktreeKey = useCallback((org: string, repo: string, branch: string) => {
    return `${org}::${repo}::${branch}`;
  }, []);

  return {
    // UI state
    width,
    setWidth,
    isRealtimeConnected,
    setIsRealtimeConnected,
    
    // Pending actions
    pendingWorktreeAction,
    setPendingWorktreeAction,
    pendingActionLoading,
    setPendingActionLoading,
    
    // Organisation collapse
    collapsedOrganisations,
    toggleOrganisationCollapsed,
    
    // Utilities
    getWorktreeKey,
  };
}

