import React, { useCallback } from 'react';
import Modal from '../../../../components/Modal.js';
import DiffViewer from '../DiffViewer.js';
import { renderSpinner } from '../../../../components/Spinner.js';

const { createElement: h } = React;

interface GitDiffModalProps {
  isOpen: boolean;
  loading: boolean;
  error: string | null;
  diff: string;
  file: {
    path: string;
    previousPath?: string | null;
    mode?: string;
  } | null;
  view: 'split' | 'unified';
  onClose: () => void;
  onToggleView: () => void;
}

export default function GitDiffModal({
  isOpen,
  loading,
  error,
  diff,
  file,
  view,
  onClose,
  onToggleView,
}: GitDiffModalProps) {
  if (!isOpen) {
    return null;
  }

  return h(
    Modal,
    {
      title: file?.path ? `Diff: ${file.path}` : 'File diff',
      onClose,
      size: 'lg',
    },
    h(
      'div',
      { className: 'space-y-3' },
      h(
        'div',
        { className: 'flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500' },
        h(
          'div',
          { className: 'space-y-1' },
          file?.previousPath
            ? h(
                'p',
                null,
                `Renamed from ${file.previousPath}`
              )
            : null,
          file?.mode
            ? h(
                'p',
                null,
                `Diff mode: ${file.mode}`
              )
            : null,
        ),
        h(
          'div',
          { className: 'flex items-center gap-2' },
          h(
            'button',
            {
              type: 'button',
              onClick: onToggleView,
              className:
                'inline-flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-200 transition hover:bg-neutral-800',
            },
            view === 'split' ? 'Show unified' : 'Show split'
          )
        )
      ),
      loading
        ? h(
            'div',
            { className: 'flex items-center gap-2 text-sm text-neutral-300' },
            renderSpinner('text-neutral-200'),
            h('span', null, 'Loading diff…')
          )
        : error
        ? h(
            'p',
            { className: 'text-sm text-rose-300' },
            error
          )
        : h(
            DiffViewer,
            {
              diff,
              view,
            }
          )
    )
  );
}

