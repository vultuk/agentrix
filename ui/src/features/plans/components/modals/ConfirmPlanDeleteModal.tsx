import React from 'react';
import Modal from '../../../../components/Modal.js';

const { createElement: h } = React;

interface ConfirmPlanDeleteModalProps {
  isOpen: boolean;
  planTitle: string | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isDeleting: boolean;
}

export default function ConfirmPlanDeleteModal({
  isOpen,
  planTitle,
  onClose,
  onConfirm,
  isDeleting,
}: ConfirmPlanDeleteModalProps) {
  if (!isOpen) {
    return null;
  }

  return h(
    Modal,
    {
      title: 'Delete this plan?',
      onClose,
      size: 'sm',
    },
    h(
      'div',
      { className: 'space-y-4 text-sm text-neutral-200' },
      h(
        'p',
        null,
        planTitle
          ? `This will permanently delete “${planTitle}”. You can’t recover it after this.`
          : 'This will permanently delete the current plan. You can’t recover it after this.',
      ),
      h(
        'div',
        { className: 'flex justify-end gap-2' },
        h(
          'button',
          {
            type: 'button',
            onClick: onClose,
            className:
              'inline-flex items-center justify-center rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-900',
          },
          'Cancel',
        ),
        h(
          'button',
          {
            type: 'button',
            disabled: isDeleting,
            onClick: () => {
              void onConfirm();
            },
            className:
              'inline-flex items-center justify-center rounded-md border border-rose-500 bg-rose-500/80 px-3 py-1.5 text-sm font-semibold text-neutral-950 transition disabled:opacity-50',
          },
          isDeleting ? 'Deleting…' : 'Delete Plan',
        ),
      ),
    ),
  );
}
