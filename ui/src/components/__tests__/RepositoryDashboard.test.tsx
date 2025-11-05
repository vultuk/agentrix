import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import RepositoryDashboard from '../RepositoryDashboard.jsx';

let replaceStateSpy;
const originalLocation = window.location;

function setLocation(url) {
  const parsed = new URL(url);
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      href: parsed.href,
      origin: parsed.origin,
      pathname: parsed.pathname,
      search: parsed.search,
      hash: parsed.hash,
    },
  });
}

vi.mock('../IssueSlideOver.jsx', () => ({
  default: ({ open, issueNumber, onClose, registerReturnFocus }) => {
    React.useEffect(() => {
      if (open && typeof registerReturnFocus === 'function') {
        registerReturnFocus(issueNumber);
      }
    }, [open, issueNumber, registerReturnFocus]);

    if (!open) {
      return null;
    }

    return (
      <div data-testid="issue-slide-over">
        <span>{`SlideOver ${issueNumber}`}</span>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
    );
  },
}));

const baseRepository = { org: 'acme', repo: 'widgets' };
const issuesPayload = {
  issues: {
    open: 2,
    items: [
      { number: 12, title: 'Fix UI regression', createdAt: '2024-01-01T10:00:00.000Z', labels: [] },
      { number: 7, title: 'Add keyboard shortcut', createdAt: '2024-01-02T11:00:00.000Z', labels: [] },
    ],
  },
};

describe('RepositoryDashboard', () => {
  beforeEach(() => {
    replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
    setLocation('http://localhost/');
  });

  afterEach(() => {
    replaceStateSpy?.mockRestore();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('opens the slide-over and syncs the query parameter when selecting an issue', async () => {
    const user = userEvent.setup();

    render(
      <RepositoryDashboard
        repository={baseRepository}
        data={issuesPayload}
        loading={false}
        error={null}
        onCreateIssuePlan={vi.fn()}
      />,
    );

    const firstCard = screen.getByRole('button', { name: /#12/i });

    await user.click(firstCard);

    await waitFor(() => {
      expect(screen.queryByTestId('issue-slide-over')).toBeInTheDocument();
    });

    const firstCall = replaceStateSpy.mock.calls.at(-1);
    expect(firstCall?.[2]).toBe('/?issue=12');

    const closeButton = screen.getByRole('button', { name: 'Close' });
    await user.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByTestId('issue-slide-over')).not.toBeInTheDocument();
    });

    const finalCall = replaceStateSpy.mock.calls.at(-1);
    expect(finalCall?.[2]).toBe('/');

    await waitFor(() => {
      expect(document.activeElement).toBe(firstCard);
    });
  });

  it('respects the initial issue query parameter and highlights the active card', async () => {
    setLocation('http://localhost/?issue=7');

    render(
      <RepositoryDashboard
        repository={baseRepository}
        data={issuesPayload}
        loading={false}
        error={null}
        onCreateIssuePlan={vi.fn()}
      />,
    );

    await waitFor(() => {
      const slideOver = screen.queryByTestId('issue-slide-over');
      expect(slideOver).toBeInTheDocument();
      expect(slideOver).toHaveTextContent('SlideOver 7');
    });

    const lastCall = replaceStateSpy.mock.calls.at(-1);
    expect(lastCall?.[2]).toBe('/?issue=7');

    const selectedCard = screen.getByRole('button', { name: /#7/i });
    expect(selectedCard.dataset.selected).toBe('true');
  });
});
