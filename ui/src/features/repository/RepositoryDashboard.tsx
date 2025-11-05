import React from 'react';
import IssueSlideOver from '../../components/issues/IssueSlideOver.js';
import IssueCard from '../../components/issues/IssueCard.js';
import type { Issue, IssueDetails, Repository } from '../../types/domain.js';

const {
  createElement: h,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} = React;

interface RepositoryDashboardData {
  pullRequests?: {
    open?: number;
  };
  issues?: {
    open?: number;
    items?: Issue[];
  };
  workflows?: {
    running?: number;
  };
  worktrees?: {
    local?: number;
  };
}

interface RepositoryDashboardProps {
  repository: Repository | null;
  data: RepositoryDashboardData | null;
  loading?: boolean;
  error?: string | null;
  onCreateIssuePlan?: (org: string, repo: string, issueNumber: number) => void;
}

export default function RepositoryDashboard({
  repository,
  data,
  loading = false,
  error = null,
  onCreateIssuePlan,
}: RepositoryDashboardProps) {
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(null);
  const issueCacheRef = useRef<Map<string, IssueDetails>>(new Map());
  const inFlightRef = useRef<Map<string, Promise<IssueDetails>>>(new Map());
  const issueRefs = useRef<Map<number, HTMLElement>>(new Map());
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const repoInitialisedRef = useRef<string>('');

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

  const updateUrl = useCallback((issueNumber: number | null) => {
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    if (Number.isInteger(issueNumber) && issueNumber && issueNumber > 0) {
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

  const registerIssueRef = useCallback((issueNumber: number, node: HTMLElement | null) => {
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
    const element = issueRefs.current.get(selectedIssueNumber as number);
    if (element) {
      returnFocusRef.current = element;
    }
  }, [selectedIssueNumber, data]);

  const handleIssueSelect = useCallback((issue: Issue | { number?: number | string }, event?: React.MouseEvent) => {
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

  const registerReturnFocus = useCallback((issueNumber: number) => {
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
    Number.isInteger(selectedIssueNumber) && selectedIssueNumber && selectedIssueNumber > 0
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
          onCreatePlan: onCreateIssuePlan,
          canCreatePlans,
        })
      : null,
  );
}

