import React from 'react';
import { Bot, Plus, Terminal as TerminalIcon, X } from 'lucide-react';
import { renderSpinner } from '../../../components/Spinner.js';
import { PREFERRED_SESSION_TOOL_STORAGE_KEY } from '../../../utils/constants.js';
import type { WorktreeSessionTab } from '../../../types/domain.js';

const { createElement: h, useEffect, useMemo, useState } = React;
type SessionTool = 'terminal' | 'agent';

interface TerminalTabsProps {
  sessions: WorktreeSessionTab[];
  activeSessionId: string | null;
  pendingCloseSessionId: string | null;
  isAddDisabled: boolean;
  onSelectSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onAddSession: () => void;
}

function TerminalTabs({
  sessions,
  activeSessionId,
  pendingCloseSessionId,
  isAddDisabled,
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
        'button',
        {
          type: 'button',
          onClick: onAddSession,
          disabled: isAddDisabled,
          className:
            'ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-800 text-neutral-300 hover:text-emerald-300 hover:border-emerald-400 transition disabled:opacity-50 disabled:cursor-not-allowed',
          title: 'New session',
          'aria-label': 'New session',
        },
        isAddDisabled ? renderSpinner('text-emerald-300') : h(Plus, { size: 14 }),
      ),
    ),
  );
}

interface TabbedTerminalPanelProps {
  sessions: WorktreeSessionTab[];
  activeSessionId: string | null;
  pendingCloseSessionId: string | null;
  isAddDisabled: boolean;
  onSelectSession: (sessionId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onAddSession: () => void;
  terminalContainerRef: React.RefObject<HTMLDivElement | null>;
  onQuickLaunchSession?: (tool: SessionTool) => void;
  isQuickLaunchPending?: boolean;
}

export default function TabbedTerminalPanel({
  sessions,
  activeSessionId,
  pendingCloseSessionId,
  isAddDisabled,
  onSelectSession,
  onCloseSession,
  onAddSession,
  terminalContainerRef,
  onQuickLaunchSession,
  isQuickLaunchPending = false,
}: TabbedTerminalPanelProps) {
  const hasSessions = sessions.length > 0;
  const sessionOptions = useMemo(
    () => [
      {
        value: 'terminal' as SessionTool,
        label: 'Terminal',
        description: 'Interactive shell',
        icon: TerminalIcon,
      },
      {
        value: 'agent' as SessionTool,
        label: 'Agent',
        description: 'Automation run',
        icon: Bot,
      },
    ],
    [],
  );

  const [preferredTool, setPreferredTool] = useState<SessionTool>(() => {
    if (typeof window === 'undefined') {
      return 'terminal';
    }
    const stored = window.localStorage.getItem(PREFERRED_SESSION_TOOL_STORAGE_KEY);
    return stored === 'agent' ? 'agent' : 'terminal';
  });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(PREFERRED_SESSION_TOOL_STORAGE_KEY, preferredTool);
    } catch (error: any) {
      console.warn('Failed to persist preferred session tool', error);
    }
  }, [preferredTool]);

  const isQuickLaunchDisabled =
    !onQuickLaunchSession || isQuickLaunchPending || isAddDisabled;
  const primaryActionLabel =
    preferredTool === 'agent' ? 'Start Agent Session' : 'Start Terminal Session';
  const PreferredIcon = preferredTool === 'agent' ? Bot : TerminalIcon;

  const emptyState = h(
    'div',
    { className: 'flex flex-col items-center justify-center gap-4 text-sm text-neutral-500 h-full px-4' },
    h('p', { className: 'text-center text-neutral-400' }, 'No terminal sessions yet.'),
    onQuickLaunchSession
      ? h(
          'div',
          { className: 'w-full max-w-md space-y-3 text-neutral-200' },
          h(
            'div',
            { className: 'flex gap-2 rounded-xl border border-neutral-800 bg-neutral-900/70 p-1' },
            sessionOptions.map((option) => {
              const Icon = option.icon;
              const isActive = preferredTool === option.value;
              return h(
                'button',
                {
                  key: option.value,
                  type: 'button',
                  onClick: () => setPreferredTool(option.value),
                  'aria-pressed': isActive,
                  className: [
                    'flex-1 rounded-lg px-3 py-2 text-left transition focus:outline-none',
                    isActive
                      ? 'bg-neutral-850 text-neutral-50 border border-emerald-500/60'
                      : 'text-neutral-400 hover:text-neutral-100 border border-transparent hover:border-neutral-700',
                  ].join(' '),
                },
                h(
                  'div',
                  { className: 'flex items-center gap-2' },
                  h(Icon, { size: 16, className: option.value === 'agent' ? 'text-amber-300' : 'text-emerald-300' }),
                  h('span', { className: 'font-semibold text-sm' }, option.label),
                ),
                h(
                  'p',
                  { className: 'text-xs text-neutral-500 mt-1' },
                  option.description,
                ),
              );
            }),
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: () => {
                if (isQuickLaunchDisabled || !onQuickLaunchSession) {
                  return;
                }
                onQuickLaunchSession(preferredTool);
              },
              disabled: isQuickLaunchDisabled,
              className:
                'w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-400/90 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed',
            },
            isQuickLaunchPending ? renderSpinner('text-neutral-900') : h(PreferredIcon, { size: 16 }),
            primaryActionLabel,
          ),
          h(
            'button',
            {
              type: 'button',
              onClick: onAddSession,
              disabled: isAddDisabled,
              className:
                'w-full rounded-md border border-neutral-800/70 bg-transparent px-4 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-100 hover:border-neutral-600 transition disabled:opacity-50 disabled:cursor-not-allowed',
            },
            isAddDisabled ? renderSpinner('text-emerald-300') : h(Plus, { size: 12 }),
            'More options',
          ),
        )
      : h(
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
