import { useState, useCallback } from 'react';

export function useLoadingState() {
  const [isAddingRepo, setIsAddingRepo] = useState(false);
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
  const [isDeletingWorktree, setIsDeletingWorktree] = useState(false);
  const [isDeletingRepo, setIsDeletingRepo] = useState(false);
  const [isCreatingPromptWorktree, setIsCreatingPromptWorktree] = useState(false);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [pendingActionLoading, setPendingActionLoading] = useState<string | null>(null);

  const startAddingRepo = useCallback(() => setIsAddingRepo(true), []);
  const stopAddingRepo = useCallback(() => setIsAddingRepo(false), []);

  const startCreatingWorktree = useCallback(() => setIsCreatingWorktree(true), []);
  const stopCreatingWorktree = useCallback(() => setIsCreatingWorktree(false), []);

  const startDeletingWorktree = useCallback(() => setIsDeletingWorktree(true), []);
  const stopDeletingWorktree = useCallback(() => setIsDeletingWorktree(false), []);

  const startDeletingRepo = useCallback(() => setIsDeletingRepo(true), []);
  const stopDeletingRepo = useCallback(() => setIsDeletingRepo(false), []);

  const startCreatingPromptWorktree = useCallback(() => setIsCreatingPromptWorktree(true), []);
  const stopCreatingPromptWorktree = useCallback(() => setIsCreatingPromptWorktree(false), []);

  const startCreatingPlan = useCallback(() => setIsCreatingPlan(true), []);
  const stopCreatingPlan = useCallback(() => setIsCreatingPlan(false), []);

  const startPendingAction = useCallback((action: string) => setPendingActionLoading(action), []);
  const stopPendingAction = useCallback(() => setPendingActionLoading(null), []);

  const resetAllLoading = useCallback(() => {
    setIsAddingRepo(false);
    setIsCreatingWorktree(false);
    setIsDeletingWorktree(false);
    setIsDeletingRepo(false);
    setIsCreatingPromptWorktree(false);
    setIsCreatingPlan(false);
    setPendingActionLoading(null);
  }, []);

  return {
    // State
    isAddingRepo,
    isCreatingWorktree,
    isDeletingWorktree,
    isDeletingRepo,
    isCreatingPromptWorktree,
    isCreatingPlan,
    pendingActionLoading,
    
    // Setters
    setIsAddingRepo,
    setIsCreatingWorktree,
    setIsDeletingWorktree,
    setIsDeletingRepo,
    setIsCreatingPromptWorktree,
    setIsCreatingPlan,
    setPendingActionLoading,
    
    // Actions
    startAddingRepo,
    stopAddingRepo,
    startCreatingWorktree,
    stopCreatingWorktree,
    startDeletingWorktree,
    stopDeletingWorktree,
    startDeletingRepo,
    stopDeletingRepo,
    startCreatingPromptWorktree,
    stopCreatingPromptWorktree,
    startCreatingPlan,
    stopCreatingPlan,
    startPendingAction,
    stopPendingAction,
    resetAllLoading,
  };
}

