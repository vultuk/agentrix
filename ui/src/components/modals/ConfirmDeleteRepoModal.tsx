import React from 'react';
import Modal from '../common/Modal.js';
import ModalFooter from '../common/ModalFooter.js';

const { createElement: h } = React;

interface ConfirmDeleteRepoModalProps {
  isOpen: boolean;
  org: string;
  repo: string;
  isDeleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ConfirmDeleteRepoModal({
  isOpen,
  org,
  repo,
  isDeleting,
  onClose,
  onConfirm,
}: ConfirmDeleteRepoModalProps) {
  if (!isOpen) {
    return null;
  }

  return h(
    Modal,
    {
      title: 'Delete repository',
      onClose: () => {
        if (!isDeleting) {
          onClose();
        }
      }
    },
    h(
      'div',
      { className: 'space-y-3 text-sm text-neutral-300' },
      h(
        'p',
        null,
        `Permanently delete ${org}/${repo} and all its worktrees?`
      ),
      h(
        'p',
        { className: 'text-xs text-rose-400 font-medium' },
        'Warning: This cannot be undone. All local worktrees will be removed.'
      )
    ),
    h(ModalFooter, {
      onCancel: onClose,
      onSubmit: onConfirm,
      submitText: 'Delete Repository',
      submitVariant: 'danger',
      loading: isDeleting,
      loadingText: 'Deleting…'
    })
  );
}

