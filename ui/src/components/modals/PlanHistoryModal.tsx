import React, { useMemo } from 'react';
import Modal from '../common/Modal.js';
import { renderSpinner } from '../common/Spinner.js';
import { renderMarkdown } from '../../utils/markdown.js';

const { createElement: h } = React;

interface PlanHistoryModalProps {
  isOpen: boolean;
  loading: boolean;
  error: string | null;
  context: { org: string; repo: string; branch?: string } | null;
  plans: any[];
  selectedPlanId: string | null;
  content: string;
  contentLoading: boolean;
  contentError: string | null;
  onClose: () => void;
  onSelectPlan: (planId: string) => void;
}

function formatPlanTimestamp(isoString: string): string {
  if (!isoString) {
    return 'Unknown date';
  }
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return date.toLocaleString();
}

export default function PlanHistoryModal({
  isOpen,
  loading,
  error,
  context,
  plans,
  selectedPlanId,
  content,
  contentLoading,
  contentError,
  onClose,
  onSelectPlan,
}: PlanHistoryModalProps) {
  if (!isOpen) {
    return null;
  }

  const selectedPlan = useMemo(
    () => plans.find((plan: any) => plan.id === selectedPlanId) || null,
    [plans, selectedPlanId]
  );

  const contentHtml = useMemo(
    () => (content ? renderMarkdown(content) : ''),
    [content]
  );

  return h(
    Modal,
    {
      title: context
        ? `Plans for ${context.org}/${context.repo}`
        : 'Plans',
      onClose,
      size: 'lg',
    },
    h(
      'div',
      { className: 'space-y-4' },
      context
        ? h(
            'p',
            { className: 'text-xs text-neutral-400' },
            `Branch: ${context.branch}`
          )
        : null,
      loading
        ? h(
            'div',
            { className: 'flex items-center gap-2 text-sm text-neutral-200' },
            renderSpinner('text-neutral-100'),
            h('span', null, 'Loading plans…')
          )
        : error
        ? h('p', { className: 'text-sm text-rose-300' }, error)
        : h(
            'div',
            { className: 'flex flex-col gap-4 lg:flex-row lg:gap-6' },
            h(
              'div',
              { className: 'lg:w-60 flex-shrink-0' },
              plans.length > 0
                ? h(
                    'div',
                    { className: 'space-y-2 max-h-[320px] overflow-y-auto pr-1' },
                    plans.map((plan: any) => {
                      const isActive = plan.id === selectedPlanId;
                      const timestampLabel = formatPlanTimestamp(plan.createdAt);
                      return h(
                        'button',
                        {
                          key: plan.id,
                          type: 'button',
                          onClick: () => onSelectPlan(plan.id),
                          className: [
                            'w-full text-left rounded-md border px-3 py-2 text-sm transition-colors',
                            isActive
                              ? 'border-emerald-500/70 bg-emerald-500/10 text-emerald-100'
                              : 'border-neutral-800 bg-neutral-950 text-neutral-300 hover:bg-neutral-900'
                          ].join(' ')
                        },
                        h('div', { className: 'font-medium truncate' }, timestampLabel),
                        h(
                          'div',
                          { className: 'text-xs text-neutral-400 mt-1 truncate' },
                          plan.id
                        )
                      );
                    })
                  )
                : h(
                    'p',
                    { className: 'text-sm text-neutral-400' },
                    'No plans saved for this worktree yet.'
                  ),
            ),
            h(
              'div',
              {
                className:
                  'flex-1 min-h-[220px] max-h-[420px] overflow-y-auto rounded-md border border-neutral-800 bg-neutral-950 px-3 py-3',
              },
              contentLoading
                ? h(
                    'div',
                    { className: 'flex items-center gap-2 text-sm text-neutral-200' },
                    renderSpinner('text-neutral-100'),
                    h('span', null, 'Loading plan…')
                  )
                : contentError
                ? h('p', { className: 'text-sm text-rose-300' }, contentError)
                : selectedPlanId
                ? h(
                    'div',
                    { className: 'space-y-3 text-sm text-neutral-100' },
                    selectedPlan
                      ? h(
                          'div',
                          {
                            className:
                              'flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2 text-xs text-neutral-400',
                          },
                          h('span', { className: 'truncate max-w-[60%]' }, selectedPlan.id),
                          h('span', null, formatPlanTimestamp(selectedPlan.createdAt))
                        )
                      : null,
                    content
                      ? h('div', {
                          className: 'markdown-preview__content space-y-3',
                          dangerouslySetInnerHTML: { __html: contentHtml },
                        })
                      : h('p', { className: 'text-sm text-neutral-400' }, 'Plan is empty.')
                  )
                : h('p', { className: 'text-sm text-neutral-400' }, 'Select a plan to view.'),
            ),
          )
    )
  );
}

