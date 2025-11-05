import React from 'react';
import { formatIssueDate, classNames } from '../../utils/formatting.js';
import type { Issue } from '../../types/domain.js';

const { createElement: h, memo, useCallback } = React;

function renderIssueLabels(labels: string[] | undefined) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return null;
  }
  return h(
    'div',
    { className: 'flex flex-wrap gap-1' },
    labels.map((label) =>
      h(
        'span',
        {
          key: label,
          className:
            'rounded-full border border-neutral-700 bg-neutral-900 px-2 py-[2px] text-[11px] text-neutral-300',
        },
        label,
      ),
    ),
  );
}

interface Repository {
  org: string;
  repo: string;
}

interface IssueCardProps {
  issue: Issue;
  repository: Repository | null;
  selected: boolean;
  onSelect: (issue: Issue, event?: React.MouseEvent | React.KeyboardEvent) => void;
  onCreatePlan?: (issue: Issue, repository: Repository | null) => void;
  canCreatePlans: boolean;
  registerRef?: (issueNumber: number, node: HTMLElement | null) => void;
}

const IssueCard = memo(function IssueCard({
  issue,
  repository,
  selected,
  onSelect,
  onCreatePlan,
  canCreatePlans,
  registerRef,
}: IssueCardProps) {
  const issueNumber = typeof issue?.number === 'number' ? issue.number : null;
  const issueTitle = typeof issue?.title === 'string' && issue.title ? issue.title : 'Untitled issue';
  const issueUrl =
    issue && typeof issue.html_url === 'string' && issue.html_url
      ? issue.html_url
      : repository
        ? `https://github.com/${repository.org}/${repository.repo}/issues/${issueNumber ?? ''}`
        : '#';

  const handleClick = useCallback(
    (event: React.MouseEvent | React.KeyboardEvent) => {
      if (!Number.isInteger(issueNumber)) {
        return;
      }
      onSelect(issue, event);
    },
    [issue, issueNumber, onSelect],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleClick(event);
      }
    },
    [handleClick],
  );

  const refCallback = useCallback(
    (node: HTMLElement | null) => {
      if (!Number.isInteger(issueNumber) || typeof registerRef !== 'function') {
        return;
      }
      if (node) {
        registerRef(issueNumber as number, node);
      } else {
        registerRef(issueNumber as number, null);
      }
    },
    [issueNumber, registerRef],
  );

  const handlePlanClick = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      if (!canCreatePlans || typeof onCreatePlan !== 'function') {
        return;
      }
      onCreatePlan(issue, repository);
    },
    [canCreatePlans, issue, onCreatePlan, repository],
  );

  const handleExternalLinkClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);

  const labelNames = issue?.labels?.map(label => 
    typeof label === 'string' ? label : (typeof label === 'object' && label?.name) ? String(label.name) : ''
  ).filter(Boolean);

  return h(
    'article',
    {
      ref: refCallback,
      role: 'button',
      tabIndex: 0,
      onClick: handleClick,
      onKeyDown: handleKeyDown,
      className: classNames(
        'rounded-md border bg-neutral-950/70 px-3 py-3 text-sm text-neutral-200 transition',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500/60',
        'hover:border-neutral-700',
        selected
          ? 'border-emerald-500/70 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]'
          : 'border-neutral-800',
      ),
      'aria-pressed': selected ? 'true' : 'false',
      'data-selected': selected ? 'true' : undefined,
    },
    h(
      'div',
      { className: 'flex flex-col gap-1' },
      h(
        'p',
        { className: 'text-sm font-semibold text-neutral-100 truncate' },
        `#${issueNumber ?? '—'} ${issueTitle}`,
      ),
      h('p', { className: 'text-xs text-neutral-400' }, formatIssueDate(issue?.created_at)),
    ),
    renderIssueLabels(labelNames),
    h(
      'div',
      { className: 'flex flex-wrap gap-2' },
      h(
        'a',
        {
          href: issueUrl,
          target: '_blank',
          rel: 'noreferrer',
          onClick: handleExternalLinkClick,
          className:
            'inline-flex items-center justify-center gap-2 rounded-md border border-neutral-700 bg-neutral-925 px-3 py-1 text-xs text-neutral-200 transition-colors hover:bg-neutral-900',
        },
        'Open on GitHub',
      ),
      canCreatePlans
        ? h(
            'button',
            {
              type: 'button',
              onClick: handlePlanClick,
              className:
                'inline-flex items-center justify-center gap-2 rounded-md border border-emerald-700/60 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/20',
            },
            'Create Plan',
          )
        : null,
    ),
  );
});

export default IssueCard;

