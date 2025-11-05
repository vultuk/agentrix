import { useState, useRef, useCallback } from 'react';
import * as worktreesService from '../../services/api/worktreesService.js';

interface UseWorktreesReturn {
  showWorktreeModal: boolean;
  setShowWorktreeModal: (show: boolean) => void;
  showPromptWorktreeModal: boolean;
  setShowPromptWorktreeModal: (show: boolean) => void;
  selectedRepo: [string, string] | null;
  setSelectedRepo: (repo: [string, string] | null) => void;
  branchName: string;
  setBranchName: (name: string) => void;
  worktreeLaunchOption: string;
  setWorktreeLaunchOption: (option: string) => void;
  launchDangerousMode: boolean;
  setLaunchDangerousMode: (dangerous: boolean) => void;
  promptText: string;
  setPromptText: (text: string) => void;
  promptAgent: string;
  setPromptAgent: (agent: string) => void;
  promptDangerousMode: boolean;
  setPromptDangerousMode: (dangerous: boolean) => void;
  promptInputMode: string;
  setPromptInputMode: (mode: string) => void;
  confirmDelete: unknown;
  setConfirmDelete: (confirm: unknown) => void;
  pendingWorktreeAction: unknown;
  setPendingWorktreeAction: (action: unknown) => void;
  pendingLaunchesRef: React.MutableRefObject<Map<string, unknown>>;
  isCreatingWorktree: boolean;
  setIsCreatingWorktree: (creating: boolean) => void;
  isDeletingWorktree: boolean;
  setIsDeletingWorktree: (deleting: boolean) => void;
  isCreatingPromptWorktree: boolean;
  setIsCreatingPromptWorktree: (creating: boolean) => void;
  openWorktreeModalForRepo: (org: string, repo: string) => void;
  openPromptModalForRepo: (org: string, repo: string) => void;
  createWorktree: (org: string, repo: string, branch: string, createBranch?: boolean) => Promise<boolean>;
  deleteWorktree: (org: string, repo: string, branch: string) => Promise<boolean>;
  closeWorktreeModal: () => void;
  closePromptWorktreeModal: () => void;
}

/**
 * Custom hook for managing worktree operations and modals
 */
export function useWorktrees(): UseWorktreesReturn {
  const [showWorktreeModal, setShowWorktreeModal] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<[string, string] | null>(null);
  const [branchName, setBranchName] = useState('');
  const [worktreeLaunchOption, setWorktreeLaunchOption] = useState('terminal');
  const [launchDangerousMode, setLaunchDangerousMode] = useState(false);
  
  const [showPromptWorktreeModal, setShowPromptWorktreeModal] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [promptAgent, setPromptAgent] = useState('codex');
  const [promptDangerousMode, setPromptDangerousMode] = useState(false);
  const [promptInputMode, setPromptInputMode] = useState('edit');
  
  const [confirmDelete, setConfirmDelete] = useState<unknown>(null);
  const [pendingWorktreeAction, setPendingWorktreeAction] = useState<unknown>(null);
  
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
  const [isDeletingWorktree, setIsDeletingWorktree] = useState(false);
  const [isCreatingPromptWorktree, setIsCreatingPromptWorktree] = useState(false);
  
  const pendingLaunchesRef = useRef<Map<string, unknown>>(new Map());

  /**
   * Open worktree creation modal for a repository
   */
  const openWorktreeModalForRepo = useCallback((org: string, repo: string) => {
    if (!org || !repo) {
      return;
    }
    setSelectedRepo([org, repo]);
    setBranchName('');
    setWorktreeLaunchOption('terminal');
    setLaunchDangerousMode(false);
    setShowWorktreeModal(true);
  }, []);

  /**
   * Open prompt-based worktree modal
   */
  const openPromptModalForRepo = useCallback((org: string, repo: string) => {
    if (!org || !repo) {
      return;
    }
    setSelectedRepo([org, repo]);
    setPromptText('');
    setPromptAgent('codex');
    setPromptDangerousMode(false);
    setPromptInputMode('edit');
    setShowPromptWorktreeModal(true);
  }, []);

  /**
   * Create a new worktree
   */
  const createWorktree = useCallback(async (
    org: string,
    repo: string,
    branch: string,
    createBranch = false
  ): Promise<boolean> => {
    setIsCreatingWorktree(true);
    try {
      await worktreesService.createWorktree(org, repo, branch, createBranch ? '' : null);
      return true;
    } catch (error) {
      throw error;
    } finally {
      setIsCreatingWorktree(false);
    }
  }, []);

  /**
   * Delete a worktree
   */
  const deleteWorktree = useCallback(async (
    org: string,
    repo: string,
    branch: string
  ): Promise<boolean> => {
    setIsDeletingWorktree(true);
    try {
      await worktreesService.deleteWorktree(org, repo, branch);
      return true;
    } catch (error) {
      throw error;
    } finally {
      setIsDeletingWorktree(false);
    }
  }, []);

  /**
   * Close worktree modal
   */
  const closeWorktreeModal = useCallback(() => {
    setShowWorktreeModal(false);
    setBranchName('');
    setSelectedRepo(null);
  }, []);

  /**
   * Close prompt worktree modal
   */
  const closePromptWorktreeModal = useCallback(() => {
    setShowPromptWorktreeModal(false);
    setPromptText('');
    setSelectedRepo(null);
  }, []);

  return {
    // Modal state
    showWorktreeModal,
    setShowWorktreeModal,
    showPromptWorktreeModal,
    setShowPromptWorktreeModal,
    
    // Form state
    selectedRepo,
    setSelectedRepo,
    branchName,
    setBranchName,
    worktreeLaunchOption,
    setWorktreeLaunchOption,
    launchDangerousMode,
    setLaunchDangerousMode,
    promptText,
    setPromptText,
    promptAgent,
    setPromptAgent,
    promptDangerousMode,
    setPromptDangerousMode,
    promptInputMode,
    setPromptInputMode,
    
    // Delete confirmation
    confirmDelete,
    setConfirmDelete,
    
    // Pending actions
    pendingWorktreeAction,
    setPendingWorktreeAction,
    pendingLaunchesRef,
    
    // Loading states
    isCreatingWorktree,
    setIsCreatingWorktree,
    isDeletingWorktree,
    setIsDeletingWorktree,
    isCreatingPromptWorktree,
    setIsCreatingPromptWorktree,
    
    // Actions
    openWorktreeModalForRepo,
    openPromptModalForRepo,
    createWorktree,
    deleteWorktree,
    closeWorktreeModal,
    closePromptWorktreeModal,
  };
}

