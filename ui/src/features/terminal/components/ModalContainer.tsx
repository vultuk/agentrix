import React, { Fragment } from 'react';
import AddRepositoryModal from '../../repositories/components/modals/AddRepositoryModal.js';
import EditRepoSettingsModal from '../../repositories/components/modals/EditRepoSettingsModal.js';
import GitDiffModal from '../../github/components/modals/GitDiffModal.js';
import PlanHistoryModal from '../../plans/components/modals/PlanHistoryModal.js';
import PromptWorktreeModal from '../../worktrees/components/modals/PromptWorktreeModal.js';
import CreateWorktreeModal from '../../worktrees/components/modals/CreateWorktreeModal.js';
import ConfirmDeleteWorktreeModal from '../../worktrees/components/modals/ConfirmDeleteWorktreeModal.js';
import ConfirmDeleteRepoModal from '../../repositories/components/modals/ConfirmDeleteRepoModal.js';
import PendingActionModal from '../../worktrees/components/modals/PendingActionModal.js';
import type { ModalContainerProps } from '../../../types/modals.js';

const { createElement: h } = React;

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

