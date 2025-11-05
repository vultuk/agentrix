/**
 * Hook for repository CRUD operations
 */

import { useCallback, useState } from 'react';
import * as reposService from '../../../services/api/reposService.js';
import { isAuthenticationError } from '../../../services/api/api-client.js';

interface UseRepositoryOperationsOptions {
  onAuthExpired?: () => void;
  onDataUpdate?: (payload: any) => void;
  onDeleteComplete?: (org: string, repo: string) => void;
}

export function useRepositoryOperations({
  onAuthExpired,
  onDataUpdate,
  onDeleteComplete,
}: UseRepositoryOperationsOptions = {}) {
  const [isAddingRepo, setIsAddingRepo] = useState(false);
  const [isDeletingRepo, setIsDeletingRepo] = useState(false);

  const addRepository = useCallback(async (url: string, initCommand: string) => {
    setIsAddingRepo(true);
    try {
      const result = await reposService.addRepository(url, initCommand);
      if (onDataUpdate) {
        onDataUpdate(result.data);
      }
      return result;
    } catch (error: any) {
      if (isAuthenticationError(error)) {
        if (onAuthExpired) {
          onAuthExpired();
        }
        throw error;
      }
      console.error('Failed to clone repository', error);
      window.alert('Failed to clone repository. Check server logs for details.');
      throw error;
    } finally {
      setIsAddingRepo(false);
    }
  }, [onAuthExpired, onDataUpdate]);

  const deleteRepository = useCallback(async (org: string, repo: string, cleanup?: () => void) => {
    setIsDeletingRepo(true);
    try {
      const payload = await reposService.deleteRepository(org, repo);
      if (onDataUpdate) {
        onDataUpdate(payload);
      }
      if (cleanup) {
        cleanup();
      }
      if (onDeleteComplete) {
        onDeleteComplete(org, repo);
      }
    } catch (error: any) {
      if (isAuthenticationError(error)) {
        if (onAuthExpired) {
          onAuthExpired();
        }
        return;
      }
      console.error('Failed to delete repository', error);
      window.alert('Failed to delete repository. Check server logs for details.');
    } finally {
      setIsDeletingRepo(false);
    }
  }, [onAuthExpired, onDataUpdate, onDeleteComplete]);

  const updateInitCommand = useCallback(async (org: string, repo: string, value: string) => {
    try {
      const payload = await reposService.updateInitCommand(org, repo, value);
      if (onDataUpdate) {
        onDataUpdate(payload);
      }
      return payload;
    } catch (error: any) {
      if (isAuthenticationError(error)) {
        if (onAuthExpired) {
          onAuthExpired();
        }
        throw error;
      }
      throw error;
    }
  }, [onAuthExpired, onDataUpdate]);

  return {
    isAddingRepo,
    isDeletingRepo,
    addRepository,
    deleteRepository,
    updateInitCommand,
  };
}

