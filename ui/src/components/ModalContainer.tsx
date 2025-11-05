import React, { Fragment } from 'react';
import AddRepositoryModal from './modals/AddRepositoryModal.js';
import EditRepoSettingsModal from './modals/EditRepoSettingsModal.js';
import GitDiffModal from './modals/GitDiffModal.js';
import PlanHistoryModal from './modals/PlanHistoryModal.js';
import PromptWorktreeModal from './modals/PromptWorktreeModal.js';
import CreateWorktreeModal from './modals/CreateWorktreeModal.js';
import ConfirmDeleteWorktreeModal from './modals/ConfirmDeleteWorktreeModal.js';
import ConfirmDeleteRepoModal from './modals/ConfirmDeleteRepoModal.js';
import PendingActionModal from './modals/PendingActionModal.js';

const { createElement: h } = React;

interface ModalContainerProps {
  // Add Repository Modal
  showAddRepoModal: boolean;
  repoUrl: string;
  repoInitCommand: string;
  isAddingRepo: boolean;
  onCloseAddRepo: () => void;
  onRepoUrlChange: (url: string) => void;
  onInitCommandChange: (cmd: string) => void;
  onSubmitAddRepo: () => Promise<void>;

  // Edit Repo Settings Modal
  editInitCommandModal: {
    open: boolean;
    org: string | null;
    repo: string | null;
    value: string;
    error: string | null;
    saving: boolean;
  };
  onCloseEditRepo: () => void;
  onEditRepoValueChange: (value: string) => void;
  onSaveInitCommand: () => Promise<void>;
  onRequestDeleteRepo: () => void;

  // Git Diff Modal
  gitDiffModal: {
    open: boolean;
    loading: boolean;
    error: string | null;
    diff: string;
    file: any;
    view: 'split' | 'unified';
  };
  onCloseGitDiff: () => void;
  onToggleDiffView: () => void;

  // Plan History Modal
  planModal: {
    open: boolean;
    loading: boolean;
    error: string | null;
    context: any;
    plans: any[];
    selectedPlanId: string | null;
    content: string;
    contentLoading: boolean;
    contentError: string | null;
  };
  onClosePlanModal: () => void;
  onSelectPlan: (planId: string) => void;

  // Prompt Worktree Modal
  showPromptWorktreeModal: boolean;
  selectedRepo: [string, string] | null;
  promptText: string;
  promptAgent: string;
  promptDangerousMode: boolean;
  promptInputMode: string;
  isCreatingPromptWorktree: boolean;
  isCreatingPlan: boolean;
  isPromptLaunchOptionDisabled: boolean;
  showPromptDangerousModeOption: boolean;
  onClosePromptModal: () => void;
  onPromptTextChange: (text: string) => void;
  onPromptAgentChange: (agent: string) => void;
  onPromptDangerousModeChange: (mode: boolean) => void;
  onPromptInputModeChange: (mode: string) => void;
  onCreatePlan: () => void;
  onSubmitPromptWorktree: () => Promise<void>;

  // Create Worktree Modal
  showWorktreeModal: boolean;
  branchName: string;
  worktreeLaunchOption: string;
  launchDangerousMode: boolean;
  isCreatingWorktree: boolean;
  isLaunchOptionDisabled: boolean;
  showDangerousModeOption: boolean;
  dangerousModeCheckboxId: string;
  onCloseWorktreeModal: () => void;
  onBranchNameChange: (name: string) => void;
  onLaunchOptionChange: (option: string) => void;
  onDangerousModeChange: (mode: boolean) => void;
  onSubmitWorktree: () => Promise<void>;

  // Confirm Delete Worktree Modal
  confirmDelete: { org: string; repo: string; branch: string } | null;
  isDeletingWorktree: boolean;
  onCloseConfirmDeleteWorktree: () => void;
  onConfirmDeleteWorktree: () => Promise<void>;

  // Confirm Delete Repo Modal
  confirmDeleteRepo: { org: string; repo: string; reopenSettings?: boolean; initCommandDraft?: string } | null;
  isDeletingRepo: boolean;
  onCloseConfirmDeleteRepo: () => void;
  onConfirmDeleteRepo: () => Promise<void>;

  // Pending Action Modal
  pendingWorktreeAction: { org: string; repo: string; branch: string } | null;
  pendingActionLoading: string | null;
  openActionMenu: string | null;
  onClosePendingAction: () => void;
  onWorktreeAction: (action: string) => Promise<void>;
  onToggleActionMenu: (action: string) => void;
  getActionMenuRef: (action: string) => (node: HTMLDivElement | null) => void;
}

export default function ModalContainer(props: ModalContainerProps) {
  return h(
    Fragment,
    null,
    h(AddRepositoryModal, {
      isOpen: props.showAddRepoModal,
      repoUrl: props.repoUrl,
      repoInitCommand: props.repoInitCommand,
      isAdding: props.isAddingRepo,
      onClose: props.onCloseAddRepo,
      onRepoUrlChange: props.onRepoUrlChange,
      onInitCommandChange: props.onInitCommandChange,
      onSubmit: props.onSubmitAddRepo,
    }),
    h(EditRepoSettingsModal, {
      isOpen: props.editInitCommandModal.open,
      org: props.editInitCommandModal.org,
      repo: props.editInitCommandModal.repo,
      value: props.editInitCommandModal.value,
      error: props.editInitCommandModal.error,
      isSaving: props.editInitCommandModal.saving,
      onClose: props.onCloseEditRepo,
      onValueChange: props.onEditRepoValueChange,
      onSave: props.onSaveInitCommand,
      onDelete: props.onRequestDeleteRepo,
    }),
    h(GitDiffModal, {
      isOpen: props.gitDiffModal.open,
      loading: props.gitDiffModal.loading,
      error: props.gitDiffModal.error,
      diff: props.gitDiffModal.diff,
      file: props.gitDiffModal.file,
      view: props.gitDiffModal.view,
      onClose: props.onCloseGitDiff,
      onToggleView: props.onToggleDiffView,
    }),
    h(PlanHistoryModal, {
      isOpen: props.planModal.open,
      loading: props.planModal.loading,
      error: props.planModal.error,
      context: props.planModal.context,
      plans: props.planModal.plans,
      selectedPlanId: props.planModal.selectedPlanId,
      content: props.planModal.content,
      contentLoading: props.planModal.contentLoading,
      contentError: props.planModal.contentError,
      onClose: props.onClosePlanModal,
      onSelectPlan: props.onSelectPlan,
    }),
    h(PromptWorktreeModal, {
      isOpen: props.showPromptWorktreeModal && Boolean(props.selectedRepo),
      repoName: props.selectedRepo?.[1] || '',
      promptText: props.promptText,
      promptAgent: props.promptAgent,
      promptDangerousMode: props.promptDangerousMode,
      promptInputMode: props.promptInputMode,
      isCreating: props.isCreatingPromptWorktree,
      isCreatingPlan: props.isCreatingPlan,
      isLaunchOptionDisabled: props.isPromptLaunchOptionDisabled,
      showDangerousModeOption: props.showPromptDangerousModeOption,
      onClose: props.onClosePromptModal,
      onPromptTextChange: props.onPromptTextChange,
      onPromptAgentChange: props.onPromptAgentChange,
      onPromptDangerousModeChange: props.onPromptDangerousModeChange,
      onPromptInputModeChange: props.onPromptInputModeChange,
      onCreatePlan: props.onCreatePlan,
      onSubmit: props.onSubmitPromptWorktree,
    }),
    h(CreateWorktreeModal, {
      isOpen: props.showWorktreeModal && Boolean(props.selectedRepo),
      repoName: props.selectedRepo?.[1] || '',
      branchName: props.branchName,
      launchOption: props.worktreeLaunchOption,
      dangerousMode: props.launchDangerousMode,
      isCreating: props.isCreatingWorktree,
      isLaunchOptionDisabled: props.isLaunchOptionDisabled,
      showDangerousModeOption: props.showDangerousModeOption,
      dangerousModeCheckboxId: props.dangerousModeCheckboxId,
      onClose: props.onCloseWorktreeModal,
      onBranchNameChange: props.onBranchNameChange,
      onLaunchOptionChange: props.onLaunchOptionChange,
      onDangerousModeChange: props.onDangerousModeChange,
      onSubmit: props.onSubmitWorktree,
    }),
    h(ConfirmDeleteWorktreeModal, {
      isOpen: Boolean(props.confirmDelete),
      org: props.confirmDelete?.org || '',
      repo: props.confirmDelete?.repo || '',
      branch: props.confirmDelete?.branch || '',
      isDeleting: props.isDeletingWorktree,
      onClose: props.onCloseConfirmDeleteWorktree,
      onConfirm: props.onConfirmDeleteWorktree,
    }),
    h(ConfirmDeleteRepoModal, {
      isOpen: Boolean(props.confirmDeleteRepo),
      org: props.confirmDeleteRepo?.org || '',
      repo: props.confirmDeleteRepo?.repo || '',
      isDeleting: props.isDeletingRepo,
      onClose: props.onCloseConfirmDeleteRepo,
      onConfirm: props.onConfirmDeleteRepo,
    }),
    h(PendingActionModal, {
      isOpen: Boolean(props.pendingWorktreeAction),
      repoName: props.pendingWorktreeAction?.repo || '',
      pendingActionLoading: props.pendingActionLoading,
      openActionMenu: props.openActionMenu,
      onClose: props.onClosePendingAction,
      onAction: props.onWorktreeAction,
      onToggleActionMenu: props.onToggleActionMenu,
      getActionMenuRef: props.getActionMenuRef,
    })
  );
}

