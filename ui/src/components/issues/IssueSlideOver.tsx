import React from 'react';
import { X, ExternalLink } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';

import { useIssueDetails, buildIssueCacheKey } from '../../hooks/useIssueDetails.js';
import { classNames, formatDateTime } from '../../utils/formatting.js';

import 'highlight.js/styles/github-dark.css';

const {
  createElement: h,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useState,
} = React;

const FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SANITIZE_SCHEMA = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema?.attributes?.code || []),
      'className',
    ],
    pre: [
      ...(defaultSchema?.attributes?.pre || []),
      'className',
    ],
    span: [
      ...(defaultSchema?.attributes?.span || []),
      'className',
    ],
    a: [
      ...(defaultSchema?.attributes?.a || []),
      'target',
      'rel',
    ],
    img: [
      ...(defaultSchema?.attributes?.img || []),
      'alt',
      'src',
      'title',
      'width',
      'height',
      'loading',
    ],
  },
};

function renderLabel(label) {
  if (!label || typeof label.name !== 'string') {
    return null;
  }
  const color = typeof label.color === 'string' && label.color ? `#${label.color}` : null;
  return h(
    'span',
    {
      key: label.name,
      className: classNames(
        'inline-flex items-center rounded-full border px-2 py-[2px] text-[11px] font-medium',
        'border-neutral-700 bg-neutral-900 text-neutral-200',
      ),
      style: color
        ? {
            borderColor: `${color}33`,
            backgroundColor: `${color}22`,
            color,
          }
        : undefined,
    },
    label.name,
  );
}

function IssueSlideOver({
  open,
  repository,
  issueNumber,
  onClose,
  cacheRef,
  inFlightRef,
  registerReturnFocus,
  onCreatePlan,
  canCreatePlans = false,
}) {
  const [refreshToken, setRefreshToken] = useState(0);
  const panelRef = useRef(null);
  const closeButtonRef = useRef(null);

  const issueState = useIssueDetails({
    repository,
    issueNumber,
    cacheRef,
    inFlightRef,
    refreshToken,
  });
  const issueDetails = issueState?.data?.issue ?? null;
  const fetchedAt =
    issueState?.data?.fetchedAt && typeof issueState.data.fetchedAt === 'string'
      ? issueState.data.fetchedAt
      : null;

  useEffect(() => {
    if (!open) {
      setRefreshToken(0);
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const focusTarget = closeButtonRef.current || panelRef.current;
    const focusTimer = setTimeout(() => {
      focusTarget?.focus({ preventScroll: true });
    }, 0);

    const handleKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') {
        return;
      }
      const container = panelRef.current;
      if (!container) {
        return;
      }
      const focusable = container.querySelectorAll(FOCUSABLE_SELECTORS);
      if (!focusable.length) {
        event.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeydown);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [open, onClose]);

  const handleOverlayClick = useCallback(
    (event) => {
      if (panelRef.current && panelRef.current.contains(event.target)) {
        return;
      }
      onClose();
    },
    [onClose],
  );

  const handleRetry = useCallback(() => {
    if (!repository || !Number.isInteger(issueNumber)) {
      return;
    }
    const cacheKey = buildIssueCacheKey(repository, issueNumber);
    if (cacheKey && cacheRef?.current) {
      cacheRef.current.delete(cacheKey);
    }
    if (cacheKey && inFlightRef?.current) {
      inFlightRef.current.delete(cacheKey);
    }
    setRefreshToken((token) => token + 1);
  }, [cacheRef, inFlightRef, repository, issueNumber]);

  const handleCreatePlanClick = useCallback(() => {
    if (!canCreatePlans || typeof onCreatePlan !== 'function') {
      return;
    }
    if (!issueDetails || !repository) {
      return;
    }
    onCreatePlan(issueDetails, repository);
    if (typeof onClose === 'function') {
      onClose();
    }
  }, [canCreatePlans, onCreatePlan, issueDetails, repository, onClose]);

  useEffect(() => {
    if (!open || typeof registerReturnFocus !== 'function') {
      return;
    }
    registerReturnFocus(issueNumber);
  }, [open, registerReturnFocus, issueNumber]);

  const metadataItems = useMemo(() => {
    const items = [];
    const issue = issueDetails;
    if (issue?.author) {
      items.push({
        key: 'author',
        label: 'Author',
        value: issue.author.name || issue.author.login || 'Unknown',
        href:
          typeof issue.author.url === 'string' && issue.author.url ? issue.author.url : undefined,
      });
    }
    if (issue?.createdAt) {
      items.push({
        key: 'created',
        label: 'Created',
        value: formatDateTime(issue.createdAt),
      });
    }
    if (issue?.updatedAt) {
      items.push({
        key: 'updated',
        label: 'Updated',
        value: formatDateTime(issue.updatedAt),
      });
    }
    if (issue?.state) {
      items.push({
        key: 'state',
        label: 'Status',
        value: issue.state.charAt(0).toUpperCase() + issue.state.slice(1),
      });
    }
    if (fetchedAt) {
      items.push({
        key: 'fetched',
        label: 'Fetched',
        value: formatDateTime(fetchedAt),
      });
    }
    return items;
  }, [issueDetails, fetchedAt]);

  const labels = Array.isArray(issueDetails?.labels) ? issueDetails.labels : [];

  const markdownContent =
    typeof issueDetails?.body === 'string' ? issueDetails.body : '';

  if (!open) {
    return null;
  }

  return h(
    Fragment,
    null,
    h('div', {
      onMouseDown: handleOverlayClick,
      className: 'fixed inset-0 z-40 bg-black/70 backdrop-blur-sm',
    }),
    h(
      'aside',
      {
        className: classNames(
          'fixed inset-y-0 right-0 z-50 flex max-w-full pointer-events-none',
        ),
        role: 'dialog',
        'aria-modal': 'true',
      },
      h(
        'div',
        {
          ref: panelRef,
          className: classNames(
            'pointer-events-auto flex h-full w-screen max-w-full flex-col border-l border-neutral-800',
            'bg-neutral-925/95 text-neutral-100 shadow-[0_0_20px_rgba(0,0,0,0.45)] backdrop-blur',
            'sm:max-w-md md:max-w-xl lg:max-w-2xl xl:max-w-3xl',
          ),
          tabIndex: -1,
        },
        h(
          'div',
          { className: 'flex items-start justify-between gap-3 border-b border-neutral-800 px-5 py-4' },
          h(
            'div',
            { className: 'min-w-0 space-y-1' },
            h(
              'p',
              { className: 'text-xs font-medium uppercase tracking-wide text-neutral-400' },
              `Issue #${issueDetails?.number ?? issueNumber ?? '—'}`,
            ),
            h(
              'h2',
              { className: 'text-lg font-semibold leading-snug text-neutral-50' },
              issueState.status === 'loading'
                ? 'Loading issue details…'
                : issueDetails?.title || 'Issue details unavailable',
            ),
          ),
          h(
            'button',
            {
              type: 'button',
              ref: closeButtonRef,
              onClick: onClose,
              className:
                'inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-700 bg-neutral-900/70 text-neutral-300 transition hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500',
              'aria-label': 'Close issue details',
            },
            h(X, { size: 18, 'aria-hidden': true }),
          ),
        ),
        h(
          'div',
          {
            className:
              'flex flex-col gap-4 overflow-y-auto px-5 py-4 text-sm leading-relaxed sm:px-6',
          },
          issueState.status === 'loading'
            ? h(
                'div',
                { className: 'space-y-3' },
                h('div', { className: 'h-4 w-2/3 animate-pulse rounded bg-neutral-800' }),
                h('div', { className: 'h-4 w-1/2 animate-pulse rounded bg-neutral-800' }),
                h('div', { className: 'h-32 animate-pulse rounded-md bg-neutral-900/80' }),
              )
            : null,
          issueState.status === 'error'
            ? h(
                'div',
                {
                  className:
                    'rounded-md border border-amber-600/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-100',
                  role: 'alert',
                },
                h('p', { className: 'font-medium' }, 'Unable to load issue details'),
                h('p', { className: 'mt-1 text-xs text-amber-200/80' }, issueState.error),
                h(
                  'div',
                  { className: 'mt-3 flex gap-2' },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: handleRetry,
                      className:
                        'inline-flex items-center justify-center rounded-md border border-amber-600/60 bg-transparent px-3 py-1 text-xs font-medium text-amber-100 transition hover:bg-amber-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/70',
                    },
                    'Retry',
                  ),
                ),
              )
            : null,
          issueState.status === 'success'
            ? h(
                Fragment,
                null,
                metadataItems.length
                  ? h(
                      'dl',
                      { className: 'grid grid-cols-1 gap-3 text-xs text-neutral-300 sm:grid-cols-2' },
                      metadataItems.map((item) =>
                        h(
                          'div',
                          { key: item.key, className: 'rounded-md border border-neutral-800 bg-neutral-900/60 px-3 py-2' },
                          h('dt', { className: 'uppercase tracking-wide text-neutral-500' }, item.label),
                          item.href
                            ? h(
                                'dd',
                                null,
                                h(
                                  'a',
                                  {
                                    href: item.href,
                                    target: '_blank',
                                    rel: 'noopener noreferrer',
                                    className:
                                      'mt-1 inline-flex items-center gap-1 text-neutral-200 underline-offset-4 transition hover:text-emerald-300 hover:underline',
                                  },
                                  item.value,
                                ),
                              )
                            : h('dd', { className: 'mt-1 text-neutral-200' }, item.value || '—'),
                        ),
                      ),
                    )
                  : null,
                labels.length
                  ? h(
                      'div',
                      { className: 'flex flex-wrap gap-2 text-xs' },
                      labels.map(renderLabel),
                    )
                  : null,
                h(
                  'div',
                  { className: 'flex flex-wrap items-center gap-3 pt-1 text-xs' },
                  repository
                    ? h(
                        'span',
                        { className: 'rounded border border-neutral-700 bg-neutral-900 px-2 py-[2px] text-neutral-300' },
                        `${repository.org}/${repository.repo}`,
                      )
                    : null,
                  h(
                    'a',
                    {
                      href:
                        issueDetails?.url ||
                        (repository
                          ? `https://github.com/${repository.org}/${repository.repo}/issues/${issueNumber}`
                          : '#'),
                      target: '_blank',
                      rel: 'noopener noreferrer',
                      className:
                        'inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs font-medium text-neutral-200 transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500',
                    },
                    h(ExternalLink, { size: 14, 'aria-hidden': true }),
                    'Open on GitHub',
                  ),
                  canCreatePlans
                    ? h(
                        'button',
                        {
                          type: 'button',
                          onClick: handleCreatePlanClick,
                          className:
                            'inline-flex items-center justify-center gap-2 rounded-md border border-emerald-700/60 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60',
                        },
                        'Create Plan',
                      )
                    : null,
                ),
                markdownContent
                  ? h(
                      'div',
                      { className: 'issue-markdown mt-3 space-y-4 text-sm leading-relaxed text-neutral-100' },
                      h(ReactMarkdown, {
                        remarkPlugins: [remarkGfm],
                        rehypePlugins: [[rehypeSanitize, SANITIZE_SCHEMA], rehypeHighlight],
                        children: markdownContent,
                        components: {
                          a: ({ href, children, ...rest }) =>
                            h(
                              'a',
                              {
                                ...rest,
                                href,
                                target: '_blank',
                                rel: 'noopener noreferrer',
                                className:
                                  'text-emerald-300 underline-offset-4 transition hover:text-emerald-200 hover:underline',
                              },
                              children,
                            ),
                          code: ({ className, children, node, ...props }) => {
                            const textContent =
                              Array.isArray(node?.children)
                                ? node.children
                                    .filter((child) => typeof child.value === 'string')
                                    .map((child) => child.value)
                                    .join('')
                                : typeof children === 'string'
                                  ? children
                                  : Array.isArray(children)
                                    ? children.filter((value) => typeof value === 'string').join('')
                                    : '';
                            const startLine = node?.position?.start?.line;
                            const endLine = node?.position?.end?.line;
                            const isSingleLine = typeof startLine === 'number' && typeof endLine === 'number'
                              ? startLine === endLine
                              : true;
                            const hasLineBreak = typeof textContent === 'string' && textContent.includes('\n');
                            const isInline = isSingleLine && !hasLineBreak;

                            if (isInline) {
                              return h(
                                'code',
                                {
                                  ...props,
                                  className: classNames(
                                    'rounded bg-neutral-800 px-1.5 py-[2px] font-mono text-[0.85em] text-neutral-100',
                                    className,
                                  ),
                                },
                                children,
                              );
                            }

                            return h(
                              'pre',
                              {
                                className: classNames(
                                  'overflow-x-auto rounded-lg border border-neutral-800 bg-neutral-900/80 p-4 text-sm text-neutral-100',
                                  className,
                                ),
                              },
                              h(
                                'code',
                                {
                                  ...props,
                                  className: classNames('hljs', className),
                                },
                                children,
                              ),
                            );
                          },
                          img: ({ alt, ...props }) =>
                            h('img', {
                              ...props,
                              alt,
                              className:
                                'max-h-[320px] w-full rounded-md border border-neutral-800 object-contain',
                              loading: 'lazy',
                            }),
                          table: ({ children }) =>
                            h(
                              'div',
                              { className: 'overflow-x-auto rounded-lg border border-neutral-800' },
                              h(
                                'table',
                                { className: 'w-full border-collapse text-sm text-left text-neutral-100' },
                                children,
                              ),
                            ),
                          th: ({ children, ...rest }) =>
                            h(
                              'th',
                              {
                                ...rest,
                                className: 'border-b border-neutral-800 bg-neutral-900 px-3 py-2 font-semibold',
                              },
                              children,
                            ),
                          td: ({ children, ...rest }) =>
                            h(
                              'td',
                              {
                                ...rest,
                                className: 'border-b border-neutral-800 px-3 py-2 text-neutral-200',
                              },
                              children,
                            ),
                        },
                      }),
                    )
                  : h(
                      'p',
                      { className: 'text-sm text-neutral-400' },
                      'This issue does not include a description.',
                    ),
              )
            : null,
        ),
      ),
    ),
  );
}

export default IssueSlideOver;
