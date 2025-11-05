import React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_BADGE_CLASSES,
  TASK_STATUS_INDICATOR_CLASSES,
} from '../../utils/constants.js';
import { formatLogTimestamp } from '../../utils/formatting.js';
import type { Task } from '../../types/domain.js';

const { createElement: h } = React;

interface TaskLog {
  id?: string;
  timestamp?: string;
  message?: string;
}

interface TaskStep {
  id?: string;
  status?: string;
  label?: string;
  logs?: TaskLog[];
}

function renderTaskStep(step: TaskStep, index: number): React.ReactElement | null {
  if (!step || typeof step !== 'object') {
    return null;
  }
  const status = step.status || 'pending';
  const indicatorClass =
    TASK_STATUS_INDICATOR_CLASSES[status as keyof typeof TASK_STATUS_INDICATOR_CLASSES] || TASK_STATUS_INDICATOR_CLASSES.pending;
  const label = step.label || `Step ${index + 1}`;
  const statusLabel = TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_LABELS] || status;
  const logs = Array.isArray(step.logs) ? step.logs : [];
  const isDefaultOpen = status === 'running' || status === 'failed';

  return h(
    'details',
    {
      key: step.id || `${label}-${index}`,
      className: 'group rounded-md border border-neutral-800/60 bg-neutral-900/45',
      open: isDefaultOpen,
    },
    h(
      'summary',
      {
        className:
          'flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm text-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/40',
      },
      h('span', { className: `h-2.5 w-2.5 flex-shrink-0 rounded-full ${indicatorClass}` }),
      h(
        'span',
        { className: 'flex-1 text-xs font-medium uppercase tracking-wide text-neutral-300' },
        label,
      ),
      h('span', { className: 'text-xs text-neutral-400' }, statusLabel),
      h(ChevronDown, {
        size: 14,
        className: 'text-neutral-500 transition-transform group-open:rotate-180',
      }),
    ),
    h(
      'div',
      { className: 'space-y-1 px-3 pb-3 pt-2 text-xs text-neutral-300' },
      logs.length
        ? logs.map((log, logIndex) =>
            h(
              'div',
              {
                key: log && log.id ? log.id : `${step.id || index}-log-${logIndex}`,
                className: 'flex gap-2',
              },
              h('span', { className: 'min-w-[4.5rem] text-neutral-500' }, formatLogTimestamp(log?.timestamp)),
              h('span', { className: 'flex-1' }, log?.message || ''),
            ),
          )
        : h('p', { className: 'text-neutral-500' }, 'No updates yet.'),
    ),
  );
}

interface TaskCardProps {
  task: Task;
}

export default function TaskCard({ task }: TaskCardProps): React.ReactElement | null {
  if (!task || typeof task !== 'object') {
    return null;
  }

  const status = task.status || 'pending';
  const badgeClass = TASK_STATUS_BADGE_CLASSES[status as keyof typeof TASK_STATUS_BADGE_CLASSES] || TASK_STATUS_BADGE_CLASSES.pending;
  const statusLabel = TASK_STATUS_LABELS[status as keyof typeof TASK_STATUS_LABELS] || status;
  const metadata = (task as unknown as { metadata?: Record<string, unknown> }).metadata || {};
  const result = task.result as Record<string, unknown> || {};
  const org = typeof metadata.org === 'string' ? metadata.org : (typeof result.org === 'string' ? result.org : '');
  const repo = typeof metadata.repo === 'string' ? metadata.repo : (typeof result.repo === 'string' ? result.repo : '');
  const branch =
    (typeof result.branch === 'string' && result.branch) ||
    (typeof metadata.branch === 'string' && metadata.branch) ||
    '';
  const titleParts = [];
  if (org && repo) {
    titleParts.push(`${org}/${repo}`);
  } else {
    titleParts.push('Automation task');
  }
  if (branch) {
    titleParts.push(`#${branch}`);
  }
  const title = titleParts.join(' ');
  const createdAt = task.createdAt ? formatLogTimestamp(task.createdAt) : '';
  const steps = Array.isArray((task as unknown as { steps?: TaskStep[] }).steps) ? (task as unknown as { steps: TaskStep[] }).steps : [];

  return h(
    'div',
    { key: task.id, className: 'rounded-lg border border-neutral-800/70 bg-neutral-900/55 shadow-inner' },
    h(
      'div',
      { className: 'flex items-center justify-between border-b border-neutral-800/70 px-4 py-3' },
      h(
        'div',
        { className: 'space-y-0.5' },
        h('p', { className: 'text-sm font-medium text-neutral-100' }, title || `Task ${task.id}`),
        createdAt
          ? h('p', { className: 'text-xs text-neutral-400' }, `Started ${createdAt}`)
          : null,
      ),
      h(
        'span',
        { className: `rounded-full px-2 py-1 text-xs font-medium ${badgeClass}` },
        statusLabel,
      ),
    ),
    h(
      'div',
      { className: 'space-y-3 px-3 py-3' },
      steps.length
        ? steps.map((step, index) => renderTaskStep(step, index))
        : h('p', { className: 'text-xs text-neutral-400' }, 'No steps reported yet.'),
      status === 'failed' && task.error && typeof task.error === 'string'
        ? h(
            'div',
            {
              className:
                'rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200',
            },
            task.error,
          )
        : null,
    ),
  );
}

