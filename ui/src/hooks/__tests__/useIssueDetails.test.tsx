import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { useIssueDetails } from '../../hooks/useIssueDetails.js';

function HookTester(props) {
  const state = useIssueDetails(props);
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      <span data-testid="error">{state.error || ''}</span>
      <span data-testid="title">{state.data?.issue?.title || ''}</span>
    </div>
  );
}

describe('useIssueDetails', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('fetches issue details and caches the result', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: {
          fetchedAt: '2024-02-01T12:00:00.000Z',
          issue: {
            number: 42,
            title: 'Improve slide-over',
            body: 'Details',
            labels: [],
          },
        },
      }),
    }));
    global.fetch = fetchMock;

    const cacheRef = { current: new Map() };
    const inFlightRef = { current: new Map() };
    const repository = { org: 'acme', repo: 'widgets' };

    const { rerender } = render(
      <HookTester
        repository={repository}
        issueNumber={42}
        cacheRef={cacheRef}
        inFlightRef={inFlightRef}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('success');
    });
    expect(screen.getByTestId('title').textContent).toBe('Improve slide-over');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cacheRef.current.size).toBe(1);

    rerender(
      <HookTester
        repository={repository}
        issueNumber={42}
        cacheRef={cacheRef}
        inFlightRef={inFlightRef}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('title').textContent).toBe('Improve slide-over');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces API errors when fetching issue details fails', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: 'Issue not found' }),
    }));
    global.fetch = fetchMock;

    const cacheRef = { current: new Map() };
    const inFlightRef = { current: new Map() };
    const repository = { org: 'acme', repo: 'widgets' };

    render(
      <HookTester
        repository={repository}
        issueNumber={404}
        cacheRef={cacheRef}
        inFlightRef={inFlightRef}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('error');
    });

    expect(screen.getByTestId('error').textContent).toContain('Issue not found');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cacheRef.current.size).toBe(0);
  });
});
