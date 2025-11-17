import React from 'react';
import Modal from '../../../../components/Modal.js';

const { createElement: h } = React;

interface PlanComposerModalProps {
  isOpen: boolean;
  org: string | null;
  repo: string | null;
  title: string;
  body: string;
  isSubmitting?: boolean;
  onTitleChange: (value: string) => void;
  onBodyChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
}

export default function PlanComposerModal({
  isOpen,
  org,
  repo,
  title,
  body,
  isSubmitting = false,
  onTitleChange,
  onBodyChange,
  onClose,
  onSubmit,
}: PlanComposerModalProps) {
  if (!isOpen) {
    return null;
  }

  const label = org && repo ? `New plan for ${org}/${repo}` : 'New Plan';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSubmit();
  };

  return h(
    Modal,
    { title: label, onClose, size: 'md' },
    h(
      'form',
      { className: 'space-y-4', onSubmit: handleSubmit },
      h(
        'div',
        null,
        h(
          'label',
          { className: 'block text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1' },
          'Title',
        ),
        h('input', {
          type: 'text',
          value: title,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => onTitleChange(event.target.value),
          className:
            'w-full rounded-md border border-neutral-700 bg-neutral-925 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none',
          placeholder: 'Describe the feature or idea…',
          required: true,
        }),
      ),
      h(
        'div',
        null,
        h(
          'label',
          { className: 'block text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-1' },
          'Plan outline',
        ),
        h('textarea', {
          value: body,
          onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => onBodyChange(event.target.value),
          className:
            'w-full min-h-[140px] rounded-md border border-neutral-700 bg-neutral-925 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none',
          placeholder: 'Outline goals, context, and key steps to discuss with Codex…',
        }),
      ),
      h(
        'div',
        { className: 'flex justify-end gap-2 pt-2' },
        h(
          'button',
          {
            type: 'button',
            onClick: onClose,
            className:
              'inline-flex items-center justify-center rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-900 transition',
          },
          'Cancel',
        ),
        h(
          'button',
          {
            type: 'submit',
            disabled: isSubmitting || !title.trim(),
            className:
              'inline-flex items-center justify-center rounded-md border border-emerald-600 bg-emerald-500/80 px-4 py-1.5 text-sm font-medium text-neutral-950 transition disabled:opacity-50',
          },
          isSubmitting ? 'Creating…' : 'Create Plan',
        ),
      ),
    ),
  );
}
