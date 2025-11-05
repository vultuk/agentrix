import React from 'react';
import Button from './Button.js';
import LoadingButton from './LoadingButton.js';

const { createElement: h } = React;

interface ModalFooterProps {
  onCancel: () => void;
  onSubmit: () => void;
  cancelText?: string;
  submitText: string;
  loading?: boolean;
  loadingText?: string;
  disabled?: boolean;
  submitVariant?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

/**
 * Standardized modal footer with cancel and submit buttons
 */
export default function ModalFooter({
  onCancel,
  onSubmit,
  cancelText = 'Cancel',
  submitText,
  loading = false,
  loadingText,
  disabled = false,
  submitVariant = 'primary',
}: ModalFooterProps) {
  return h(
    'div',
    { className: 'flex justify-end gap-2 pt-2' },
    h(Button, { variant: 'ghost', onClick: onCancel }, cancelText),
    h(
      LoadingButton,
      {
        variant: submitVariant,
        loading,
        loadingText,
        disabled,
        onClick: onSubmit,
      },
      submitText
    )
  );
}

