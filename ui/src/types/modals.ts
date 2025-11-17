/**
 * Modal-related types and interfaces
 */

import type { PlanModalState as PlanModalStateShape } from './plan.js';

// Add Repository Modal
export interface AddRepositoryModalProps {
  showAddRepoModal: boolean;
  repoUrl: string;
  repoInitCommand: string;
  isAddingRepo: boolean;
  onCloseAddRepo: () => void;
  onRepoUrlChange: (url: string) => void;
  onInitCommandChange: (cmd: string) => void;
  onSubmitAddRepo: () => Promise<void>;
}

// Edit Repo Settings Modal
export interface EditRepoSettingsModalState {
  open: boolean;
  org: string | null;
  repo: string | null;
  value: string;
  error: string | null;
  saving: boolean;
}

export interface EditRepoSettingsModalProps {
  editInitCommandModal: EditRepoSettingsModalState;
  onCloseEditRepo: () => void;
  onEditRepoValueChange: (value: string) => void;
  onSaveInitCommand: () => Promise<void>;
  onRequestDeleteRepo: () => void;
}

// Git Diff Modal
export interface GitDiffModalState {
  open: boolean;
  loading: boolean;
  error: string | null;
  diff: string;
  file: any;
  view: 'split' | 'unified';
}

export interface GitDiffModalProps {
  gitDiffModal: GitDiffModalState;
  onCloseGitDiff: () => void;
  onToggleDiffView: () => void;
}

// Plan History Modal
export type PlanModalState = PlanModalStateShape;

export interface PlanHistoryModalProps {
  planModal: PlanModalState;
  onClosePlanModal: () => void;
  onSelectPlan: (planId: string) => void;
}

export interface PlanComposerModalState {
  open: boolean;
  org: string | null;
  repo: string | null;
  title: string;
  body: string;
}

export interface PlanComposerModalProps {
  planComposerModal: PlanComposerModalState;
  onClosePlanComposer: () => void;
  onPlanComposerFieldChange: (field: 'title' | 'body', value: string) => void;
  onSubmitPlanComposer: () => Promise<void>;
  isSubmittingPlanComposer: boolean;
}

export interface PlanDeleteModalState {
  open: boolean;
  title: string | null;
}

export interface PlanDeleteModalProps {
  planDeleteModal: PlanDeleteModalState;
  onClosePlanDeleteModal: () => void;
  onConfirmPlanDelete: () => Promise<void>;
  isDeletingPlan: boolean;
}

// Prompt Worktree Modal
export interface PromptWorktreeModalProps {
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
}

// Create Worktree Modal
export interface CreateWorktreeModalProps {
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
}

// Confirm Delete Worktree Modal
export interface ConfirmDeleteWorktreeState {
  org: string;
  repo: string;
  branch: string;
}

export interface ConfirmDeleteWorktreeModalProps {
  confirmDelete: ConfirmDeleteWorktreeState | null;
  isDeletingWorktree: boolean;
  onCloseConfirmDeleteWorktree: () => void;
  onConfirmDeleteWorktree: () => Promise<void>;
}

// Confirm Delete Repo Modal
export interface ConfirmDeleteRepoState {
  org: string;
  repo: string;
  reopenSettings?: boolean;
  initCommandDraft?: string;
}

export interface ConfirmDeleteRepoModalProps {
  confirmDeleteRepo: ConfirmDeleteRepoState | null;
  isDeletingRepo: boolean;
  onCloseConfirmDeleteRepo: () => void;
  onConfirmDeleteRepo: () => Promise<void>;
}

// Pending Action Modal
export interface PendingWorktreeAction {
  org: string;
  repo: string;
  branch: string;
}

export interface PendingActionModalProps {
  pendingWorktreeAction: PendingWorktreeAction | null;
  pendingActionLoading: string | null;
  openActionMenu: string | null;
  onClosePendingAction: () => void;
  onWorktreeAction: (action: string) => Promise<void>;
  onToggleActionMenu: (key: string) => void;
  getActionMenuRef: (key: string) => (node: HTMLDivElement | null) => void;
}

// Combined Modal Container Props
export interface ModalContainerProps
  extends AddRepositoryModalProps,
    EditRepoSettingsModalProps,
    GitDiffModalProps,
    PlanHistoryModalProps,
    PlanComposerModalProps,
    PlanDeleteModalProps,
    PromptWorktreeModalProps,
    CreateWorktreeModalProps,
    ConfirmDeleteWorktreeModalProps,
    ConfirmDeleteRepoModalProps,
    PendingActionModalProps {}
