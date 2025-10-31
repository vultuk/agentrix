import React from 'react';
const { createElement: h } = React;

export default function RepositoryDashboard({
  repository,
  data,
  loading = false,
  error = null,
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
        typeof data?.workflows?.running === 'number'
          ? data.workflows.running
          : null,
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
        className:
          'grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 content-start',
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
  );
}
