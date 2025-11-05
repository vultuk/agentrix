import React from 'react';
import Modal from '../../../../components/Modal.js';
import TextArea from '../../../../components/TextArea.js';
import ModalFooter from '../../../../components/ModalFooter.js';

const { createElement: h } = React;

interface EditRepoSettingsModalProps {
  isOpen: boolean;
  org: string | null;
  repo: string | null;
  value: string;
  error: string | null;
  isSaving: boolean;
  onClose: () => void;
  onValueChange: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
}

export default function EditRepoSettingsModal({
  isOpen,
  org,
  repo,
  value,
  error,
  isSaving,
  onClose,
  onValueChange,
  onSave,
  onDelete,
}: EditRepoSettingsModalProps) {
  if (!isOpen || !org || !repo) {
    return null;
  }

  return h(
    Modal,
    {
      title: `Repository settings: ${org}/${repo}`,
      onClose: () => {
        if (!isSaving) {
          onClose();
        }
      }
    },
    h(
      'div',
      { className: 'space-y-5' },
      h(
        'section',
        { className: 'space-y-2' },
        h(
          'p',
          { className: 'text-xs text-neutral-400 leading-relaxed' },
          'This command runs after new worktrees for this repository are created.'
        ),
        h(TextArea, {
          value,
          onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onValueChange(event.target.value),
          placeholder: 'npm install',
          rows: 4,
          disabled: isSaving,
          className: 'min-h-[112px]'
        }),
        h(
          'p',
          { className: 'text-xs text-neutral-500 leading-relaxed' },
          'Leave blank to skip running a setup command.'
        ),
        error
          ? h(
              'p',
              { className: 'text-xs text-rose-400' },
              error
            )
          : null
      ),
      h(
        'section',
        { className: 'space-y-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-3' },
        h(
          'div',
          { className: 'space-y-1' },
          h(
            'p',
            { className: 'text-sm font-semibold text-rose-100' },
            'Danger zone'
          ),
          h(
            'p',
            { className: 'text-xs text-rose-100/80 leading-relaxed' },
            'Deleting this repository removes all worktrees, terminal sessions, and local checkout data.'
          )
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: onDelete,
            disabled: isSaving,
            className:
              'inline-flex items-center justify-center gap-2 rounded-md border border-rose-400/60 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-100 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60'
          },
          'Delete repository'
        )
      )
    ),
    h(ModalFooter, {
      onCancel: onClose,
      onSubmit: onSave,
      submitText: 'Save command',
      loading: isSaving,
      loadingText: 'Saving…'
    })
  );
}

