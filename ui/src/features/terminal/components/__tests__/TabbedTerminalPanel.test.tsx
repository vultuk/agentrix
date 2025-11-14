import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TabbedTerminalPanel from '../TabbedTerminalPanel.js';

describe('TabbedTerminalPanel empty state', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('launches the selected session tool when creating the first session', () => {
    const onQuickLaunchSession = vi.fn();

    render(
      <TabbedTerminalPanel
        sessions={[]}
        activeSessionId={null}
        pendingCloseSessionId={null}
        isAddDisabled={false}
        onSelectSession={() => {}}
        onCloseSession={() => {}}
        onAddSession={() => {}}
        onQuickLaunchSession={onQuickLaunchSession}
        isQuickLaunchPending={false}
        terminalContainerRef={{ current: null }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /agent automation run/i }));
    fireEvent.click(screen.getByRole('button', { name: /start agent session/i }));

    expect(onQuickLaunchSession).toHaveBeenCalledTimes(1);
    expect(onQuickLaunchSession).toHaveBeenCalledWith('agent');
  });

  it('hides close button for non-closable sessions', () => {
    render(
      <TabbedTerminalPanel
        sessions={[
          {
            id: 'codex-sdk',
            label: 'Codex SDK',
            kind: 'automation',
            tool: 'agent',
            idle: false,
            usingTmux: false,
            lastActivityAt: null,
            createdAt: null,
          },
        ]}
        activeSessionId="codex-sdk"
        pendingCloseSessionId={null}
        isAddDisabled={false}
        onSelectSession={() => {}}
        onCloseSession={() => {}}
        onAddSession={() => {}}
        terminalContainerRef={{ current: null }}
        nonClosableSessionIds={new Set(['codex-sdk'])}
      />,
    );

    expect(screen.queryByRole('button', { name: /close session/i })).toBeNull();
  });

  it('shows live status indicators inside each tab', () => {
    render(
      <TabbedTerminalPanel
        sessions={[
          {
            id: 'term-1',
            label: 'Terminal',
            kind: 'interactive',
            tool: 'terminal',
            idle: false,
            usingTmux: false,
            lastActivityAt: null,
            createdAt: null,
          },
          {
            id: 'codex-1',
            label: 'Codex SDK',
            kind: 'automation',
            tool: 'agent',
            idle: true,
            usingTmux: false,
            lastActivityAt: null,
            createdAt: null,
          },
        ]}
        activeSessionId="term-1"
        pendingCloseSessionId={null}
        isAddDisabled={false}
        onSelectSession={() => {}}
        onCloseSession={() => {}}
        onAddSession={() => {}}
        terminalContainerRef={{ current: null }}
      />,
    );

    expect(screen.getByTitle('Session live')).toBeInTheDocument();
    expect(screen.getByTitle('Session idle')).toBeInTheDocument();
  });
});
