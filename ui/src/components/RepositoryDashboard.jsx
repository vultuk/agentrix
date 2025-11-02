import React from 'react';

const { createElement: h } = React;

function formatIssueDate(value) {
  if (!value) {
    return 'Opened date unavailable';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Opened date unavailable';
  }
  return `Opened ${date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })}`;
}

function renderIssueLabels(labels) {
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

export default function RepositoryDashboard({
  repository,
  data,
  loading = false,
  error = null,
  onCreateIssuePlan,
}) {
  const metrics = [
    {
      key: 'pullRequests',
      label: 'Open Pull Requests',
      value:
        typeof data?.pullRequests?.open === 'number' ? data.pullRequests.open : null,
      description: 'Pending reviews and merges',
    },
    {
      key: 'issues',
      label: 'Open Issues',
      value: typeof data?.issues?.open === 'number' ? data.issues.open : null,
      description: 'Outstanding bugs and tasks',
    },
    {
      key: 'workflows',
      label: 'Running Workflows',
      value:
        typeof data?.workflows?.running === 'number' ? data.workflows.running : null,
      description: 'Active GitHub Actions runs',
    },
    {
      key: 'worktrees',
      label: 'Local Worktrees',
      value:
        typeof data?.worktrees?.local === 'number' ? data.worktrees.local : null,
      description: 'Accessible development branches (excluding main)',
    },
  ];

  const repoLabel = repository ? `${repository.org}/${repository.repo}` : '';
  const issues = Array.isArray(data?.issues?.items) ? data.issues.items : [];
  const issueCount = typeof data?.issues?.open === 'number' ? data.issues.open : null;
  const canCreatePlans = typeof onCreateIssuePlan === 'function';

  return h(
    'div',
    { className: 'flex flex-col gap-4 min-h-0 h-full' },
    repoLabel
      ? h(
          'p',
          { className: 'text-xs text-neutral-500 uppercase tracking-wide' },
          repoLabel,
        )
      : null,
    error
      ? h(
          'div',
          {
            className:
              'text-xs text-amber-200 bg-amber-500/10 border border-amber-500/40 rounded-md px-3 py-2',
            role: 'status',
          },
          error,
        )
      : null,
    h(
      'div',
      {
        className: 'grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 content-start',
      },
      metrics.map((metric) =>
        h(
          'div',
          {
            key: metric.key,
            className:
              'rounded-lg border border-neutral-800 bg-neutral-925/90 px-4 py-5 flex flex-col gap-2',
          },
          h(
            'p',
            { className: 'text-xs uppercase tracking-wide text-neutral-500' },
            metric.label,
          ),
          h(
            'p',
            { className: 'text-3xl font-semibold text-neutral-100' },
            metric.value === null ? '—' : metric.value,
          ),
          metric.description
            ? h('p', { className: 'text-xs text-neutral-500' }, metric.description)
            : null,
        ),
      ),
    ),
    h(
      'div',
      { className: 'space-y-3' },
      h(
        'div',
        { className: 'flex items-center justify-between gap-2' },
        h('p', { className: 'text-sm font-medium text-neutral-200' }, 'Open Issues'),
        issueCount !== null
          ? h('span', { className: 'text-xs text-neutral-400' }, `${issueCount} open`)
          : null,
      ),
      loading && issues.length === 0
        ? h(
            'div',
            {
              className:
                'rounded-lg border border-neutral-800 bg-neutral-925/90 px-4 py-6 text-sm text-neutral-400',
            },
            'Loading open issues…',
          )
        : null,
      !loading && issues.length === 0
        ? h(
            'div',
            {
              className:
                'rounded-lg border border-neutral-800 bg-neutral-925/90 px-4 py-6 text-sm text-neutral-400',
            },
            'No open issues found.',
          )
        : null,
      issues.length > 0
        ? h(
            'div',
            {
              className:
                'space-y-2 rounded-lg border border-neutral-800 bg-neutral-925/90 p-4 max-h-[50vh] overflow-y-auto',
            },
            issues.map((issue, index) => {
              const key =
                typeof issue?.number === 'number'
                  ? `issue-${issue.number}`
                  : typeof issue?.title === 'string' && issue.title
                  ? `issue-${index}-${issue.title}`
                  : `issue-${index}`;
              const issueUrl =
                issue && typeof issue.url === 'string' && issue.url
                  ? issue.url
                  : repository
                  ? `https://github.com/${repository.org}/${repository.repo}/issues/${issue?.number ?? ''}`
                  : '#';
              return h(
                'article',
                {
                  key,
                  className:
                    'rounded-md border border-neutral-800 bg-neutral-950/70 px-3 py-3 text-sm text-neutral-200 space-y-2',
                },
                h(
                  'div',
                  { className: 'flex flex-col gap-1' },
                  h(
                    'p',
                    { className: 'text-sm font-semibold text-neutral-100 truncate' },
                    `#${issue?.number ?? '—'} ${issue?.title || 'Untitled issue'}`,
                  ),
                  h('p', { className: 'text-xs text-neutral-400' }, formatIssueDate(issue?.createdAt)),
                ),
                renderIssueLabels(issue?.labels),
                h(
                  'div',
                  { className: 'flex flex-wrap gap-2' },
                  h(
                    'a',
                    {
                      href: issueUrl,
                      target: '_blank',
                      rel: 'noreferrer',
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
                          onClick: () => onCreateIssuePlan(issue, repository),
                          className:
                            'inline-flex items-center justify-center gap-2 rounded-md border border-emerald-700/60 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/20',
                        },
                        'Create Plan',
                      )
                    : null,
                ),
              );
            }),
          )
        : null,
    ),
  );
}
