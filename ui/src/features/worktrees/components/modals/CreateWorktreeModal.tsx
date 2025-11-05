import React, { Fragment } from 'react';
import Modal from '../../../../components/Modal.js';
import Input from '../../../../components/Input.js';
import Label from '../../../../components/Label.js';
import ModalFooter from '../../../../components/ModalFooter.js';
import { WORKTREE_LAUNCH_OPTIONS } from '../../../../config/commands.js';

const { createElement: h } = React;

interface CreateWorktreeModalProps {
  isOpen: boolean;
  repoName: string;
  branchName: string;
  launchOption: string;
  dangerousMode: boolean;
  isCreating: boolean;
  isLaunchOptionDisabled: boolean;
  showDangerousModeOption: boolean;
  dangerousModeCheckboxId: string;
  onClose: () => void;
  onBranchNameChange: (value: string) => void;
  onLaunchOptionChange: (value: string) => void;
  onDangerousModeChange: (value: boolean) => void;
  onSubmit: () => void;
}

export default function CreateWorktreeModal({
  isOpen,
  repoName,
  branchName,
  launchOption,
  dangerousMode,
  isCreating,
  isLaunchOptionDisabled,
  showDangerousModeOption,
  dangerousModeCheckboxId,
  onClose,
  onBranchNameChange,
  onLaunchOptionChange,
  onDangerousModeChange,
  onSubmit,
}: CreateWorktreeModalProps) {
  if (!isOpen) {
    return null;
  }

  return h(
    Modal,
    {
      title: `Create worktree for ${repoName}`,
      onClose
    },
    h(
      'div',
      { className: 'space-y-3' },
      h(Label, null, 'Branch name'),
      h(Input, {
        value: branchName,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => onBranchNameChange(event.target.value),
        onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter' && !event.shiftKey && !(event.nativeEvent as any).isComposing) {
            event.preventDefault();
            if (!isCreating) {
              onSubmit();
            }
          }
        },
        placeholder: 'feature/my-awesome-branch'
      }),
      h(
        Fragment,
        null,
        h(Label, null, 'Launch option'),
        h(
          'select',
          {
            value: launchOption,
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
              onLaunchOptionChange(event.target.value);
              onDangerousModeChange(false);
            },
            disabled: isLaunchOptionDisabled,
            className:
              'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60 disabled:cursor-not-allowed disabled:opacity-60'
          },
          WORKTREE_LAUNCH_OPTIONS.map(option =>
            h(
              'option',
              { key: option.value, value: option.value },
              option.label
            )
          )
        )
      ),
      showDangerousModeOption
        ? h(
            'label',
            {
              className:
                'inline-flex items-center gap-2 text-xs text-neutral-300',
              htmlFor: dangerousModeCheckboxId
            },
            h('input', {
              id: dangerousModeCheckboxId,
              type: 'checkbox',
              checked: dangerousMode,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => onDangerousModeChange(event.target.checked),
              disabled: isLaunchOptionDisabled,
              className:
                'h-4 w-4 rounded border border-neutral-700 bg-neutral-950 text-neutral-100 focus:ring-1 focus:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-60'
            }),
            'Start in Dangerous Mode'
          )
        : null
    ),
    h(ModalFooter, {
      onCancel: onClose,
      onSubmit,
      submitText: 'Create worktree',
      loading: isCreating,
      loadingText: 'Creating…',
      disabled: !branchName.trim()
    })
  );
}

