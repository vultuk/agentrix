/**
 * Hook for managing all modal state in RepoBrowser
 */

import { useState, useCallback } from 'react';
import { createEmptyPlanModalState } from '../../../types/plan.js';

interface ConfirmDelete {
  org: string;
  repo: string;
  branch: string;
}

interface ConfirmDeleteRepo {
  org: string;
  repo: string;
  reopenSettings?: boolean;
  initCommandDraft?: string;
}

interface EditInitCommandModal {
  open: boolean;
  org: string | null;
  repo: string | null;
  value: string;
  error: string | null;
  saving: boolean;
}

interface PlanComposerModalState {
  open: boolean;
  org: string | null;
  repo: string | null;
  title: string;
  body: string;
}

interface PlanDeleteModalState {
  open: boolean;
  title: string | null;
}
export function useRepoBrowserModals() {
  // Add repository modal
  const [showAddRepoModal, setShowAddRepoModal] = useState(false);
  const [repoUrl, setRepoUrl] = useState('');
  const [repoInitCommand, setRepoInitCommand] = useState('');

  // Create worktree modal
  const [showWorktreeModal, setShowWorktreeModal] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<[string, string] | null>(null);
  const [branchName, setBranchName] = useState('');
  const [worktreeLaunchOption, setWorktreeLaunchOption] = useState('terminal');
  const [launchDangerousMode, setLaunchDangerousMode] = useState(false);

  // Prompt worktree modal
  const [showPromptWorktreeModal, setShowPromptWorktreeModal] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [promptAgent, setPromptAgent] = useState('codex');
  const [promptDangerousMode, setPromptDangerousMode] = useState(false);
  const [promptInputMode, setPromptInputMode] = useState('edit');

  // Delete confirmations
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null);
  const [confirmDeleteRepo, setConfirmDeleteRepo] = useState<ConfirmDeleteRepo | null>(null);

  // Edit repo settings modal
  const [editInitCommandModal, setEditInitCommandModal] = useState<EditInitCommandModal>({
    open: false,
    org: null,
    repo: null,
    value: '',
    error: null,
    saving: false,
  });

  // Git diff modal
  const [gitDiffModal, setGitDiffModal] = useState<{
    open: boolean;
    loading: boolean;
    error: string | null;
    diff: string;
    file: any;
    view: 'split' | 'unified';
  }>(() => ({
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

  // Plan modal
  const [planModal, setPlanModal] = useState(() => createEmptyPlanModalState());
  const [planComposerModal, setPlanComposerModal] = useState<PlanComposerModalState>({
    open: false,
    org: null,
    repo: null,
    title: '',
    body: '',
  });
  const [planDeleteModal, setPlanDeleteModal] = useState<PlanDeleteModalState>({
    open: false,
    title: null,
  });

  const openWorktreeModal = useCallback((org: string, repo: string) => {
    setSelectedRepo([org, repo]);
    setBranchName('');
    setWorktreeLaunchOption('terminal');
    setLaunchDangerousMode(false);
    setShowWorktreeModal(true);
  }, []);

  const closeWorktreeModal = useCallback(() => {
    setShowWorktreeModal(false);
    setBranchName('');
    setSelectedRepo(null);
  }, []);

  const openPromptModal = useCallback((org: string, repo: string) => {
    setSelectedRepo([org, repo]);
    setPromptText('');
    setPromptAgent('codex');
    setPromptDangerousMode(false);
    setPromptInputMode('edit');
    setShowPromptWorktreeModal(true);
  }, []);

  const closePromptModal = useCallback(() => {
    setShowPromptWorktreeModal(false);
    setPromptText('');
    setPromptAgent('codex');
    setPromptDangerousMode(false);
    setPromptInputMode('edit');
    setSelectedRepo(null);
  }, []);

  const openEditRepoSettings = useCallback((org: string, repo: string, value: string = '') => {
    setEditInitCommandModal({
      open: true,
      org,
      repo,
      value: typeof value === 'string' ? value : '',
      error: null,
      saving: false,
    });
  }, []);

  const closeEditRepoSettings = useCallback(() => {
    setEditInitCommandModal({
      open: false,
      org: null,
      repo: null,
      value: '',
      error: null,
      saving: false,
    });
  }, []);

  const closeGitDiff = useCallback(() => {
    const defaultView: 'split' | 'unified' =
      typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
        ? 'unified'
        : 'split';
    setGitDiffModal({ open: false, loading: false, error: null, diff: '', file: null, view: defaultView });
  }, []);

  const closePlanModal = useCallback(() => {
    setPlanModal(createEmptyPlanModalState());
  }, []);

  const openPlanComposerModal = useCallback((org: string, repo: string) => {
    setPlanComposerModal({
      open: true,
      org,
      repo,
      title: '',
      body: '',
    });
  }, []);

  const closePlanComposerModal = useCallback(() => {
    setPlanComposerModal({
      open: false,
      org: null,
      repo: null,
      title: '',
      body: '',
    });
  }, []);

  const openPlanDeleteModal = useCallback((title: string | null) => {
    setPlanDeleteModal({ open: true, title: title ?? null });
  }, []);

  const closePlanDeleteModal = useCallback(() => {
    setPlanDeleteModal({ open: false, title: null });
  }, []);

  return {
    // Add repo modal
    showAddRepoModal,
    setShowAddRepoModal,
    repoUrl,
    setRepoUrl,
    repoInitCommand,
    setRepoInitCommand,

    // Worktree modal
    showWorktreeModal,
    setShowWorktreeModal,
    selectedRepo,
    setSelectedRepo,
    branchName,
    setBranchName,
    worktreeLaunchOption,
    setWorktreeLaunchOption,
    launchDangerousMode,
    setLaunchDangerousMode,
    openWorktreeModal,
    closeWorktreeModal,

    // Prompt modal
    showPromptWorktreeModal,
    setShowPromptWorktreeModal,
    promptText,
    setPromptText,
    promptAgent,
    setPromptAgent,
    promptDangerousMode,
    setPromptDangerousMode,
    promptInputMode,
    setPromptInputMode,
    openPromptModal,
    closePromptModal,

    // Delete confirmations
    confirmDelete,
    setConfirmDelete,
    confirmDeleteRepo,
    setConfirmDeleteRepo,

    // Edit repo settings
    editInitCommandModal,
    setEditInitCommandModal,
    openEditRepoSettings,
    closeEditRepoSettings,

    // Git diff
    gitDiffModal,
    setGitDiffModal,
    closeGitDiff,

    // Plan modal
    planModal,
    setPlanModal,
    closePlanModal,
    planComposerModal,
    setPlanComposerModal,
    openPlanComposerModal,
    closePlanComposerModal,
    planDeleteModal,
    openPlanDeleteModal,
    closePlanDeleteModal,
  };
}
