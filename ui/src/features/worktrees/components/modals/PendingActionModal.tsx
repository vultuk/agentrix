import React from 'react';
import Modal from '../../../../components/Modal.js';
import { renderSpinner } from '../../../../components/Spinner.js';
import { ChevronDown } from 'lucide-react';

const { createElement: h } = React;

interface PendingActionModalProps {
  isOpen: boolean;
  repoName: string;
  pendingActionLoading: string | null;
  openActionMenu: string | null;
  onClose: () => void;
  onAction: (action: string) => void;
  onToggleActionMenu: (action: string) => void;
  getActionMenuRef: (action: string) => (node: HTMLDivElement | null) => void;
}

export default function PendingActionModal({
  isOpen,
  repoName,
  pendingActionLoading,
  openActionMenu,
  onClose,
  onAction,
  onToggleActionMenu,
  getActionMenuRef,
}: PendingActionModalProps) {
  if (!isOpen) {
    return null;
  }

  const isCodexLoading = Boolean(
    pendingActionLoading && typeof pendingActionLoading === 'string' && pendingActionLoading.startsWith('codex')
  );
  const isClaudeLoading = Boolean(
    pendingActionLoading && typeof pendingActionLoading === 'string' && pendingActionLoading.startsWith('claude')
  );
  const isCursorLoading = pendingActionLoading === 'cursor' || pendingActionLoading === 'ide';
  const isCodexSdkLoading = pendingActionLoading === 'codex_sdk';

  return h(
    Modal,
    {
      title: `Open ${repoName}`,
      onClose: () => {
        if (!pendingActionLoading) {
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
        'Choose how you want to start working in this worktree:'
      ),
      h(
        'div',
        { className: 'space-y-2' },
        // Terminal option
        h(
          'button',
          {
            onClick: () => onAction('terminal'),
            disabled: Boolean(pendingActionLoading),
            'aria-busy': pendingActionLoading === 'terminal',
            className:
              'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
          },
          pendingActionLoading === 'terminal'
            ? h(
                'span',
                { className: 'inline-flex items-center gap-2' },
                renderSpinner('text-neutral-100'),
                'Opening…'
              )
            : 'Open Terminal'
        ),
        // VS Code option
        h(
          'button',
          {
            onClick: () => onAction('vscode'),
            disabled: Boolean(pendingActionLoading),
            'aria-busy': pendingActionLoading === 'vscode',
            className:
              'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
          },
          pendingActionLoading === 'vscode'
            ? h(
                'span',
                { className: 'inline-flex items-center gap-2' },
                renderSpinner('text-neutral-100'),
                'Opening…'
              )
            : 'Open in VS Code'
        ),
        // Codex option with menu
        h(
          'div',
          {
            className: 'flex items-stretch gap-2',
            ref: getActionMenuRef('codex')
          },
          h(
            'button',
            {
              onClick: () => onAction('codex'),
              disabled: Boolean(pendingActionLoading),
              'aria-busy': isCodexLoading,
              className:
                'flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
            },
            isCodexLoading
              ? h(
                  'span',
                  { className: 'inline-flex items-center gap-2' },
                  renderSpinner('text-neutral-100'),
                  'Opening…'
                )
              : 'Open Codex'
          ),
          h(
            'div',
            { className: 'relative' },
            h(
              'button',
              {
                type: 'button',
                onClick: (event: React.MouseEvent) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleActionMenu('codex');
                },
                disabled: Boolean(pendingActionLoading),
                'aria-label': 'Open Codex options',
                'aria-haspopup': 'menu',
                'aria-expanded': openActionMenu === 'codex',
                className:
                  'h-full rounded-md border border-neutral-700 bg-neutral-900 px-2 text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900 flex items-center justify-center'
              },
              h(ChevronDown, { size: 14 })
            ),
            openActionMenu === 'codex'
              ? h(
                  'div',
                  {
                    role: 'menu',
                    className:
                      'absolute right-0 mt-2 w-48 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 py-1 text-sm shadow-lg z-10'
                  },
                  h(
                    'button',
                    {
                      type: 'button',
                      role: 'menuitem',
                      onClick: () => onAction('codex-dangerous'),
                      className:
                        'block w-full px-3 py-2 text-left text-neutral-100 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60',
                      disabled: Boolean(pendingActionLoading)
                    },
                    'Dangerous Mode'
                  )
                )
              : null
        )
      ),
      h(
        'button',
        {
          onClick: () => onAction('codex_sdk'),
          disabled: Boolean(pendingActionLoading),
          'aria-busy': isCodexSdkLoading,
          className:
            'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
        },
        isCodexSdkLoading
          ? h(
              'span',
              { className: 'inline-flex items-center gap-2' },
              renderSpinner('text-neutral-100'),
              'Opening…'
            )
          : 'Open Codex SDK'
      ),
        // Cursor option
        h(
          'button',
          {
            onClick: () => onAction('cursor'),
            disabled: Boolean(pendingActionLoading),
            'aria-busy': isCursorLoading,
            className:
              'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
          },
          isCursorLoading
            ? h(
                'span',
                { className: 'inline-flex items-center gap-2' },
                renderSpinner('text-neutral-100'),
                'Launching…'
              )
            : 'Launch Cursor'
        ),
        // Claude option with menu
        h(
          'div',
          {
            className: 'flex items-stretch gap-2',
            ref: getActionMenuRef('claude')
          },
          h(
            'button',
            {
              onClick: () => onAction('claude'),
              disabled: Boolean(pendingActionLoading),
              'aria-busy': isClaudeLoading,
              className:
                'flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
            },
            isClaudeLoading
              ? h(
                  'span',
                  { className: 'inline-flex items-center gap-2' },
                  renderSpinner('text-neutral-100'),
                  'Opening…'
                )
              : 'Open Claude'
          ),
          h(
            'div',
            { className: 'relative' },
            h(
              'button',
              {
                type: 'button',
                onClick: (event: React.MouseEvent) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleActionMenu('claude');
                },
                disabled: Boolean(pendingActionLoading),
                'aria-label': 'Open Claude options',
                'aria-haspopup': 'menu',
                'aria-expanded': openActionMenu === 'claude',
                className:
                  'h-full rounded-md border border-neutral-700 bg-neutral-900 px-2 text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900 flex items-center justify-center'
              },
              h(ChevronDown, { size: 14 })
            ),
            openActionMenu === 'claude'
              ? h(
                  'div',
                  {
                    role: 'menu',
                    className:
                      'absolute right-0 mt-2 w-48 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 py-1 text-sm shadow-lg z-10'
                  },
                  h(
                    'button',
                    {
                      type: 'button',
                      role: 'menuitem',
                      onClick: () => onAction('claude-dangerous'),
                      className:
                        'block w-full px-3 py-2 text-left text-neutral-100 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60',
                      disabled: Boolean(pendingActionLoading)
                    },
                    'Dangerous Mode'
                  )
                )
              : null
          )
        )
      )
    )
  );
}
