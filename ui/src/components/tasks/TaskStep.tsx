import React from 'react';
import { ChevronDown } from 'lucide-react';
import { TASK_STATUS_LABELS, TASK_STATUS_INDICATOR_CLASSES } from '../../config/tasks.js';
import { formatLogTimestamp } from '../../utils/time.js';

const { createElement: h } = React;

interface TaskLog {
  id?: string;
  timestamp?: string | Date | number;
  message?: string;
}

export interface TaskStepData {
  id?: string;
  status?: string;
  label?: string;
  logs?: TaskLog[];
}

interface TaskStepProps {
  step: TaskStepData;
  index: number;
}

export function TaskStep({ step, index }: TaskStepProps) {
  if (!step || typeof step !== 'object') {
    return null;
  }
  const status = step.status || 'pending';
  const indicatorClass =
    TASK_STATUS_INDICATOR_CLASSES[status] || TASK_STATUS_INDICATOR_CLASSES.pending;
  const label = step.label || `Step ${index + 1}`;
  const statusLabel = TASK_STATUS_LABELS[status] || status;
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

