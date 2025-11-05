import { useState, useCallback } from 'react';
import { createEmptyPlanModalState } from '../types/plan.js';

interface EditInitCommandModalState {
  open: boolean;
  org: string | null;
  repo: string | null;
  value: string;
  error: string | null;
  saving: boolean;
}

interface GitDiffModalState {
  open: boolean;
  loading: boolean;
  error: string | null;
  diff: string;
  file: string | null;
  view: 'split' | 'unified';
}

interface ConfirmDeleteState {
  org: string;
  repo: string;
  branch: string;
}

interface ConfirmDeleteRepoState {
  org: string;
  repo: string;
  reopenSettings?: boolean;
}

interface PendingWorktreeAction {
  org: string;
  repo: string;
  branch: string;
}

export function useModals() {
  const [showAddRepoModal, setShowAddRepoModal] = useState(false);
  const [showWorktreeModal, setShowWorktreeModal] = useState(false);
  const [showPromptWorktreeModal, setShowPromptWorktreeModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteState | null>(null);
  const [confirmDeleteRepo, setConfirmDeleteRepo] = useState<ConfirmDeleteRepoState | null>(null);
  const [pendingWorktreeAction, setPendingWorktreeAction] = useState<PendingWorktreeAction | null>(null);
  
  const [editInitCommandModal, setEditInitCommandModal] = useState<EditInitCommandModalState>({
    open: false,
    org: null,
    repo: null,
    value: '',
    error: null,
    saving: false,
  });

  const [gitDiffModal, setGitDiffModal] = useState<GitDiffModalState>(() => ({
    open: false,
    loading: false,
    error: null,
    diff: '',
    file: null,
    view:
      typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
        ? 'unified'
        : 'split',
  }));

  const [planModal, setPlanModal] = useState(() => createEmptyPlanModalState());

  const openAddRepoModal = useCallback(() => setShowAddRepoModal(true), []);
  const closeAddRepoModal = useCallback(() => setShowAddRepoModal(false), []);

  const openWorktreeModal = useCallback(() => setShowWorktreeModal(true), []);
  const closeWorktreeModal = useCallback(() => setShowWorktreeModal(false), []);

  const openPromptWorktreeModal = useCallback(() => setShowPromptWorktreeModal(true), []);
  const closePromptWorktreeModal = useCallback(() => setShowPromptWorktreeModal(false), []);

  const openConfirmDelete = useCallback((state: ConfirmDeleteState) => setConfirmDelete(state), []);
  const closeConfirmDelete = useCallback(() => setConfirmDelete(null), []);

  const openConfirmDeleteRepo = useCallback((state: ConfirmDeleteRepoState) => setConfirmDeleteRepo(state), []);
  const closeConfirmDeleteRepo = useCallback(() => setConfirmDeleteRepo(null), []);

  const openPendingWorktreeAction = useCallback((state: PendingWorktreeAction) => setPendingWorktreeAction(state), []);
  const closePendingWorktreeAction = useCallback(() => setPendingWorktreeAction(null), []);

  const openEditInitCommandModal = useCallback((org: string, repo: string, value: string) => {
    setEditInitCommandModal({
      open: true,
      org,
      repo,
      value,
      error: null,
      saving: false,
    });
  }, []);

  const closeEditInitCommandModal = useCallback(() => {
    setEditInitCommandModal(prev => ({ ...prev, open: false }));
  }, []);

  const updateEditInitCommandModal = useCallback((updates: Partial<EditInitCommandModalState>) => {
    setEditInitCommandModal(prev => ({ ...prev, ...updates }));
  }, []);

  const openGitDiffModal = useCallback((file: string) => {
    setGitDiffModal(prev => ({ ...prev, open: true, file, loading: true, error: null, diff: '' }));
  }, []);

  const closeGitDiffModal = useCallback(() => {
    setGitDiffModal(prev => ({ ...prev, open: false }));
  }, []);

  const updateGitDiffModal = useCallback((updates: Partial<GitDiffModalState>) => {
    setGitDiffModal(prev => ({ ...prev, ...updates }));
  }, []);

  const updatePlanModal = useCallback((updates: Partial<ReturnType<typeof createEmptyPlanModalState>>) => {
    setPlanModal(prev => ({ ...prev, ...updates }));
  }, []);

  const resetPlanModal = useCallback(() => {
    setPlanModal(createEmptyPlanModalState());
  }, []);

  return {
    // State
    showAddRepoModal,
    showWorktreeModal,
    showPromptWorktreeModal,
    confirmDelete,
    confirmDeleteRepo,
    pendingWorktreeAction,
    editInitCommandModal,
    gitDiffModal,
    planModal,
    
    // Setters (for direct access when needed)
    setShowAddRepoModal,
    setShowWorktreeModal,
    setShowPromptWorktreeModal,
    setConfirmDelete,
    setConfirmDeleteRepo,
    setPendingWorktreeAction,
    setEditInitCommandModal,
    setGitDiffModal,
    setPlanModal,
    
    // Actions
    openAddRepoModal,
    closeAddRepoModal,
    openWorktreeModal,
    closeWorktreeModal,
    openPromptWorktreeModal,
    closePromptWorktreeModal,
    openConfirmDelete,
    closeConfirmDelete,
    openConfirmDeleteRepo,
    closeConfirmDeleteRepo,
    openPendingWorktreeAction,
    closePendingWorktreeAction,
    openEditInitCommandModal,
    closeEditInitCommandModal,
    updateEditInitCommandModal,
    openGitDiffModal,
    closeGitDiffModal,
    updateGitDiffModal,
    updatePlanModal,
    resetPlanModal,
  };
}

