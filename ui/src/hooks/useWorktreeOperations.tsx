/**
 * Hook for worktree CRUD operations
 */

import { useCallback, useState } from 'react';
import * as worktreesService from '../services/api/worktreesService.js';
import { isAuthenticationError } from '../services/api/api-client.js';

interface UseWorktreeOperationsOptions {
  onAuthExpired?: () => void;
  onDataUpdate?: (payload: any) => void;
  onDeleteComplete?: (org: string, repo: string, branch: string) => void;
}

export function useWorktreeOperations({
  onAuthExpired,
  onDataUpdate,
  onDeleteComplete,
}: UseWorktreeOperationsOptions = {}) {
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
  const [isDeletingWorktree, setIsDeletingWorktree] = useState(false);
  const [isCreatingPromptWorktree, setIsCreatingPromptWorktree] = useState(false);

  const createWorktree = useCallback(async (org: string, repo: string, branch: string | null, prompt: string | null) => {
    const isPromptWorkflow = prompt !== null;
    if (isPromptWorkflow) {
      setIsCreatingPromptWorktree(true);
    } else {
      setIsCreatingWorktree(true);
    }
    try {
      const result = await worktreesService.createWorktree(org, repo, branch, prompt);
      return result;
    } catch (error: any) {
      if (isAuthenticationError(error)) {
        if (onAuthExpired) {
          onAuthExpired();
        }
        throw error;
      }
      console.error('Failed to create worktree', error);
      window.alert('Failed to create worktree. Check server logs for details.');
      throw error;
    } finally {
      if (isPromptWorkflow) {
        setIsCreatingPromptWorktree(false);
      } else {
        setIsCreatingWorktree(false);
      }
    }
  }, [onAuthExpired]);

  const deleteWorktree = useCallback(async (org: string, repo: string, branch: string) => {
    setIsDeletingWorktree(true);
    try {
      const payload = await worktreesService.deleteWorktree(org, repo, branch);
      if (onDataUpdate) {
        onDataUpdate(payload);
      }
      if (onDeleteComplete) {
        onDeleteComplete(org, repo, branch);
      }
    } catch (error: any) {
      if (isAuthenticationError(error)) {
        if (onAuthExpired) {
          onAuthExpired();
        }
        return;
      }
      console.error('Failed to remove worktree', error);
      window.alert('Failed to remove worktree. Check server logs for details.');
    } finally {
      setIsDeletingWorktree(false);
    }
  }, [onAuthExpired, onDataUpdate, onDeleteComplete]);

  return {
    isCreatingWorktree,
    isDeletingWorktree,
    isCreatingPromptWorktree,
    createWorktree,
    deleteWorktree,
  };
}

