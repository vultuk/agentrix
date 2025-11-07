import React, { Fragment } from 'react';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { Bot, Plus, Terminal as TerminalIcon, X } from 'lucide-react';
import { renderSpinner } from '../../../components/Spinner.js';
import type { WorktreeSessionTab } from '../../../types/domain.js';

const { createElement: h } = React;

interface TerminalTabsProps {
  sessions: WorktreeSessionTab[];
  activeSessionId: string | null;
  pendingCloseSessionId: string | null;
  isAddDisabled: boolean;
  sessionCreationOptions: Array<{ value: string; label: string }>;
  onSelectSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onAddSession: (option: string) => void;
}

function TerminalTabs({
  sessions,
  activeSessionId,
  pendingCloseSessionId,
  isAddDisabled,
  sessionCreationOptions,
  onSelectSession,
  onCloseSession,
  onAddSession,
}: TerminalTabsProps) {
  return h(
    'div',
    { className: 'border-b border-neutral-800 bg-neutral-950/70' },
    h(
      'div',
      { className: 'flex items-center gap-2 px-3 py-2 overflow-x-auto' },
      sessions.length === 0
        ? h(
            'div',
            { className: 'text-xs uppercase tracking-wide text-neutral-500' },
            'No active sessions',
          )
        : sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const isClosing = pendingCloseSessionId === session.id;
            const Icon = session.tool === 'agent' ? Bot : TerminalIcon;
            return h(
              'button',
              {
                key: session.id,
                type: 'button',
                onClick: () => onSelectSession(session.id),
                className: [
                  'group flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors min-w-[140px]',
                  isActive
                    ? 'border-emerald-400/60 bg-neutral-900 text-neutral-50'
                    : 'border-neutral-800 bg-neutral-925 text-neutral-400 hover:text-neutral-100 hover:border-neutral-700',
                ].join(' '),
              },
              h(
                'div',
                { className: 'flex items-center gap-2 min-w-0 flex-1 text-left' },
                h(Icon, {
                  size: 14,
                  className: session.tool === 'agent' ? 'text-amber-300' : 'text-emerald-300',
                }),
                h(
                  'span',
                  { className: 'truncate' },
                  session.label || (session.tool === 'agent' ? 'Agent' : 'Terminal'),
                ),
                session.idle
                  ? h('span', {
                      className: 'ml-1 h-2 w-2 rounded-full bg-amber-300 flex-shrink-0',
                      title: 'Session idle',
                    })
                  : null,
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: (event: React.MouseEvent) => {
                    event.stopPropagation();
                    onCloseSession(session.id);
                  },
                  disabled: isClosing,
                  className: [
                    'ml-2 inline-flex h-5 w-5 items-center justify-center rounded transition-colors',
                    isActive ? 'text-neutral-200 hover:bg-neutral-800' : 'text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/70',
                    isClosing ? 'opacity-50 cursor-not-allowed' : '',
                  ].join(' '),
                  title: 'Close session',
                  'aria-label': 'Close session',
                },
                isClosing ? h('span', { className: 'text-[10px]' }, '…') : h(X, { size: 12 }),
              ),
            );
          }),
      h(
        'div',
        { className: 'ml-auto relative' },
        h(
          Menu,
          { as: Fragment },
          h(
            MenuButton,
            {
              disabled: isAddDisabled,
              className:
                'inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-800 text-neutral-300 hover:text-emerald-300 hover:border-emerald-400 transition disabled:opacity-50 disabled:cursor-not-allowed',
              title: 'New session',
              'aria-label': 'New session',
            },
            isAddDisabled ? renderSpinner('text-emerald-300') : h(Plus, { size: 14 }),
          ),
          isAddDisabled
            ? null
            : h(
                MenuItems,
                {
                  className:
                    'absolute right-0 mt-2 min-w-[180px] rounded-md border border-neutral-800 bg-neutral-950 py-1 text-sm shadow-lg z-20 focus:outline-none',
                },
                sessionCreationOptions.map((option) =>
                  h(
                    MenuItem,
                    { key: option.value },
                    ({ active }) =>
                      h(
                        'button',
                        {
                          type: 'button',
                          onClick: () => onAddSession(option.value),
                          className: `flex w-full items-center gap-2 px-3 py-2 text-left ${
                            active ? 'bg-neutral-900 text-neutral-50' : 'text-neutral-300'
                          }`,
                        },
                        option.value === 'terminal'
                          ? h(TerminalIcon, { size: 14 })
                          : h(Bot, { size: 14 }),
                        h('span', { className: 'truncate' }, option.label),
                      ),
                  ),
                ),
              ),
        ),
      ),
    ),
  );
}

interface TabbedTerminalPanelProps {
  sessions: WorktreeSessionTab[];
  activeSessionId: string | null;
  pendingCloseSessionId: string | null;
  isAddDisabled: boolean;
  sessionCreationOptions: Array<{ value: string; label: string }>;
  onSelectSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onAddSession: (option: string) => void;
  terminalContainerRef: React.RefObject<HTMLDivElement | null>;
}

export default function TabbedTerminalPanel({
  sessions,
  activeSessionId,
  pendingCloseSessionId,
  isAddDisabled,
  sessionCreationOptions,
  onSelectSession,
  onCloseSession,
  onAddSession,
  terminalContainerRef,
}: TabbedTerminalPanelProps) {
  const hasSessions = sessions.length > 0;

  const emptyState = h(
    'div',
    { className: 'flex flex-col items-center justify-center gap-2 text-sm text-neutral-500 h-full' },
    h('p', null, 'No terminal sessions yet.'),
    h(
      'button',
      {
        type: 'button',
        onClick: onAddSession,
        disabled: isAddDisabled,
        className:
          'inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-925 px-3 py-1.5 text-xs text-neutral-200 hover:text-emerald-300 hover:border-emerald-400 transition disabled:opacity-50 disabled:cursor-not-allowed',
      },
      isAddDisabled ? renderSpinner('text-emerald-300') : h(Plus, { size: 14 }),
      'New session',
    ),
  );

  return h(
    'div',
    { className: 'flex-1 min-h-0 flex flex-col bg-neutral-950' },
    h(TerminalTabs, {
      sessions,
      activeSessionId,
      pendingCloseSessionId,
      isAddDisabled,
      sessionCreationOptions,
      onSelectSession,
      onCloseSession,
      onAddSession,
    }),
    h(
      'div',
      { className: 'flex-1 min-h-0 relative' },
      hasSessions
        ? h('div', {
            ref: terminalContainerRef,
            className: 'absolute inset-0 overflow-hidden',
          })
        : emptyState,
    ),
  );
}
