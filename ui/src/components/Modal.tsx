import React from 'react';
import { X } from 'lucide-react';

const { createElement: h } = React;

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'md' | 'lg';
  position?: 'center' | 'top';
}

export default function Modal({ title, onClose, children, size = 'md', position = 'center' }: ModalProps) {
  const content = Array.isArray(children) ? children : [children];
  const alignmentClass = position === 'top' ? 'items-start' : 'items-center';
  const wrapperSpacingClass = position === 'top' ? 'mt-10' : '';
  const maxWidthClass = size === 'lg' ? 'max-w-[90vw]' : 'max-w-md';
  return h(
    'div',
    {
      className: [
        'fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center z-50 p-4',
        alignmentClass
      ]
        .filter(Boolean)
        .join(' '),
      onClick: onClose
    },
    h(
      'div',
      {
        className: [
          'bg-neutral-900 border border-neutral-700 rounded-lg w-full shadow-xl max-h-[90vh] flex flex-col overflow-hidden',
          maxWidthClass,
          wrapperSpacingClass
        ]
          .filter(Boolean)
          .join(' '),
        onClick: (event: React.MouseEvent) => event.stopPropagation()
      },
      h(
        'div',
        { className: 'flex items-center justify-between px-4 py-3 border-b border-neutral-800' },
        h('h2', { className: 'text-sm font-semibold text-neutral-100' }, title),
        h(
          'button',
          {
            type: 'button',
            onClick: onClose,
            className: 'text-neutral-500 hover:text-neutral-200 transition-colors'
          },
          h(X, { size: 16 })
        )
      ),
      h(
        'div',
        { className: 'px-4 py-4 space-y-3 flex-1 overflow-y-auto min-h-0 flex flex-col' },
        ...content
      )
    )
  );
}

