import React from 'react';

const { createElement: h } = React;

interface ErrorMessageProps {
  message: string | null | undefined;
  onRetry?: () => void;
}

export default function ErrorMessage({ message, onRetry }: ErrorMessageProps) {
  if (!message) {
    return null;
  }

  return h(
    'div',
    {
      className: 'rounded-md border border-amber-600/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-100',
      role: 'alert'
    },
    h('p', { className: 'font-medium' }, typeof message === 'string' ? message : 'An error occurred'),
    onRetry
      ? h(
          'div',
          { className: 'mt-3' },
          h(
            'button',
            {
              type: 'button',
              onClick: onRetry,
              className: 'inline-flex items-center justify-center rounded-md border border-amber-600/60 bg-transparent px-3 py-1 text-xs font-medium text-amber-100 transition hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/70'
            },
            'Retry'
          )
        )
      : null
  );
}

