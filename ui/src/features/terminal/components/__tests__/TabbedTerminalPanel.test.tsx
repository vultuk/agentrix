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
});
