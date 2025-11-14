import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import CodexSdkChatPanel from '../CodexSdkChatPanel.js';

describe('CodexSdkChatPanel', () => {
  it('renders events and sends messages', async () => {
    const onSend = vi.fn(async () => {});
    render(
      <CodexSdkChatPanel
        events={[
          { type: 'ready', message: 'ready', timestamp: '2024-01-01T00:00:00Z' },
          { type: 'user_message', id: 'u-1', text: 'User text', timestamp: '2024-01-01T00:01:00Z' },
          { type: 'log', level: 'info', message: 'Verbose output', timestamp: '2024-01-01T00:01:30Z' },
          { type: 'agent_response', id: 'a-1', text: 'Response text', timestamp: '2024-01-01T00:02:00Z' },
        ]}
        isSending={false}
        connectionState="connected"
        session={{
          id: 'sdk-1',
          org: 'acme',
          repo: 'demo',
          branch: 'feature',
          label: 'Codex SDK',
          createdAt: '2024-01-01T00:00:00Z',
          lastActivityAt: null,
        }}
        lastError={null}
        onSend={onSend}
      />,
    );

    expect(screen.getByText('User text')).toBeInTheDocument();
    expect(screen.getByText('Response text')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/describe the next step/i);
    fireEvent.change(textarea, { target: { value: 'Implement feature' } });
    fireEvent.submit(textarea.closest('form') as HTMLFormElement);

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('Implement feature');
    expect(screen.getByText(/Verbose output/)).toBeInTheDocument();
  });
});
