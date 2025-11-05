import React from 'react';
import Modal from '../../../../components/Modal.js';
import ModalFooter from '../../../../components/ModalFooter.js';

const { createElement: h } = React;

interface ConfirmDeleteWorktreeModalProps {
  isOpen: boolean;
  org: string;
  repo: string;
  branch: string;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ConfirmDeleteWorktreeModal({
  isOpen,
  org,
  repo,
  branch,
  isDeleting,
  onClose,
  onConfirm,
}: ConfirmDeleteWorktreeModalProps) {
  if (!isOpen) {
    return null;
  }

  return h(
    Modal,
    {
      title: 'Remove worktree',
      onClose: () => {
        if (!isDeleting) {
          onClose();
        }
      }
    },
    h(
      'div',
      { className: 'space-y-3 text-sm text-neutral-300' },
      h('p', null, `Remove ${branch} from ${repo}?`),
      h(
        'p',
        { className: 'text-xs text-neutral-500' },
        'This only detaches the worktree locally. The Git branch remains.'
      )
    ),
    h(ModalFooter, {
      onCancel: onClose,
      onSubmit: onConfirm,
      submitText: 'Remove',
      submitVariant: 'danger',
      loading: isDeleting,
      loadingText: 'Removing…'
    })
  );
}

