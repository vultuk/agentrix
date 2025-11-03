import React from 'react';
import IssueSlideOver from './IssueSlideOver.jsx';

const {
  createElement: h,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  memo,
} = React;

function classNames(...values) {
  return values.filter(Boolean).join(' ');
}

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

const IssueCard = memo(function IssueCard({
  issue,
  repository,
  selected,
  onSelect,
  onCreatePlan,
  canCreatePlans,
  registerRef,
}) {
  const issueNumber = typeof issue?.number === 'number' ? issue.number : null;
  const issueTitle = typeof issue?.title === 'string' && issue.title ? issue.title : 'Untitled issue';
  const issueUrl =
    issue && typeof issue.url === 'string' && issue.url
      ? issue.url
      : repository
        ? `https://github.com/${repository.org}/${repository.repo}/issues/${issueNumber ?? ''}`
        : '#';

  const handleClick = useCallback(
    (event) => {
      if (!Number.isInteger(issueNumber)) {
        return;
      }
      onSelect(issue, event);
    },
    [issue, issueNumber, onSelect],
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleClick(event);
      }
    },
    [handleClick],
  );

  const refCallback = useCallback(
    (node) => {
      if (!Number.isInteger(issueNumber) || typeof registerRef !== 'function') {
        return;
      }
      if (node) {
        registerRef(issueNumber, node);
      } else {
        registerRef(issueNumber, null);
      }
    },
    [issueNumber, registerRef],
  );

  const handlePlanClick = useCallback(
    (event) => {
      event.stopPropagation();
      if (!canCreatePlans || typeof onCreatePlan !== 'function') {
        return;
      }
      onCreatePlan(issue, repository);
    },
    [canCreatePlans, issue, onCreatePlan, repository],
  );

  const handleExternalLinkClick = useCallback((event) => {
    event.stopPropagation();
  }, []);

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

export default function RepositoryDashboard({
  repository,
  data,
  loading = false,
  error = null,
  onCreateIssuePlan,
}) {
  const [selectedIssueNumber, setSelectedIssueNumber] = useState(null);
  const issueCacheRef = useRef(new Map());
  const inFlightRef = useRef(new Map());
  const issueRefs = useRef(new Map());
  const returnFocusRef = useRef(null);
  const repoInitialisedRef = useRef('');

  const repoKey = useMemo(() => {
    if (!repository) {
      return '';
    }
    const org = typeof repository.org === 'string' ? repository.org : '';
    const repoSlug = typeof repository.repo === 'string' ? repository.repo : '';
    if (!org || !repoSlug) {
      return '';
    }
    return `${org}/${repoSlug}`;
  }, [repository]);

  useEffect(() => {
    if (!repoKey) {
      setSelectedIssueNumber(null);
      repoInitialisedRef.current = '';
      return;
    }
    if (repoInitialisedRef.current === repoKey) {
      return;
    }
    repoInitialisedRef.current = repoKey;
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    const issueParam = url.searchParams.get('issue');
    if (!issueParam) {
      setSelectedIssueNumber(null);
      return;
    }
    const parsed = Number.parseInt(issueParam, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
      setSelectedIssueNumber(parsed);
    } else {
      setSelectedIssueNumber(null);
    }
  }, [repoKey]);

  const updateUrl = useCallback((issueNumber) => {
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    if (Number.isInteger(issueNumber) && issueNumber > 0) {
      url.searchParams.set('issue', String(issueNumber));
    } else {
      url.searchParams.delete('issue');
    }
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    try {
      window.history.replaceState(window.history.state, '', nextUrl);
    } catch {
      // Ignore history failures in non-browser environments (e.g. tests)
    }
  }, []);

  useEffect(() => {
    updateUrl(selectedIssueNumber);
  }, [selectedIssueNumber, updateUrl]);

  const registerIssueRef = useCallback((issueNumber, node) => {
    if (!Number.isInteger(issueNumber)) {
      return;
    }
    if (node) {
      issueRefs.current.set(issueNumber, node);
    } else {
      issueRefs.current.delete(issueNumber);
    }
  }, []);

  useEffect(() => {
    if (!Number.isInteger(selectedIssueNumber)) {
      return;
    }
    const element = issueRefs.current.get(selectedIssueNumber);
    if (element) {
      returnFocusRef.current = element;
    }
  }, [selectedIssueNumber, data]);

  const handleIssueSelect = useCallback((issue, event) => {
    const number =
      issue && typeof issue.number === 'number'
        ? issue.number
        : Number.parseInt(typeof issue?.number === 'string' ? issue.number : '', 10);
    if (!Number.isInteger(number) || number <= 0) {
      return;
    }
    setSelectedIssueNumber(number);
    if (event?.currentTarget instanceof HTMLElement) {
      returnFocusRef.current = event.currentTarget;
    } else {
      const target = issueRefs.current.get(number);
      if (target) {
        returnFocusRef.current = target;
      }
    }
  }, []);

  const handleCloseIssue = useCallback(() => {
    setSelectedIssueNumber(null);
    const target = returnFocusRef.current;
    if (target && typeof target.focus === 'function') {
      setTimeout(() => {
        target.focus({ preventScroll: true });
      }, 0);
    }
  }, []);

  const registerReturnFocus = useCallback((issueNumber) => {
    if (!Number.isInteger(issueNumber)) {
      return;
    }
    const target = issueRefs.current.get(issueNumber);
    if (target) {
      returnFocusRef.current = target;
    }
  }, []);

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
  const activeIssueNumber =
    Number.isInteger(selectedIssueNumber) && selectedIssueNumber > 0
      ? selectedIssueNumber
      : null;

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
          'grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4 lg:grid-cols-4 content-start',
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
                'space-y-2 rounded-lg border border-neutral-800 bg-neutral-925/90 p-4 max-h-[50vh] lg:max-h-[75vh] xl:max-h-[calc(100vh-240px)] overflow-y-auto',
            },
            issues.map((issue, index) =>
              h(IssueCard, {
                key:
                  typeof issue?.number === 'number'
                    ? `issue-${issue.number}`
                    : typeof issue?.title === 'string' && issue?.title
                      ? `issue-${index}-${issue.title}`
                      : `issue-${index}`,
                issue,
                repository,
                selected:
                  Number.isInteger(activeIssueNumber) &&
                  typeof issue?.number === 'number' &&
                  issue.number === activeIssueNumber,
                onSelect: handleIssueSelect,
                onCreatePlan: onCreateIssuePlan,
                canCreatePlans,
                registerRef: registerIssueRef,
              }),
            ),
          )
        : null,
    ),
    activeIssueNumber && repository
      ? h(IssueSlideOver, {
          open: Boolean(activeIssueNumber),
          repository,
          issueNumber: activeIssueNumber,
          onClose: handleCloseIssue,
          cacheRef: issueCacheRef,
          inFlightRef,
          registerReturnFocus,
        })
      : null,
  );
}
