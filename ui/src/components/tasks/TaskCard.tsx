import React from 'react';
import { TASK_STATUS_LABELS, TASK_STATUS_BADGE_CLASSES } from '../../config/tasks.js';
import { formatLogTimestamp } from '../../utils/time.js';
import { TaskStep } from './TaskStep.js';

const { createElement: h } = React;

interface TaskError {
  message?: string;
}

interface TaskMetadata {
  org?: string;
  repo?: string;
  branch?: string;
}

interface TaskResult {
  org?: string;
  repo?: string;
  branch?: string;
}

interface TaskStepData {
  id?: string;
  status?: string;
  label?: string;
  logs?: Array<{ id?: string; timestamp?: string | Date | number; message?: string }>;
}

export interface TaskData {
  id: string;
  status?: string;
  metadata?: TaskMetadata;
  result?: TaskResult;
  createdAt?: string | Date | number;
  steps?: TaskStepData[];
  error?: TaskError;
}

interface TaskCardProps {
  task: TaskData;
}

export function TaskCard({ task }: TaskCardProps) {
  if (!task || typeof task !== 'object') {
    return null;
  }

  const status = task.status || 'pending';
  const badgeClass = TASK_STATUS_BADGE_CLASSES[status] || TASK_STATUS_BADGE_CLASSES.pending;
  const statusLabel = TASK_STATUS_LABELS[status] || status;
  const metadata = task.metadata || {};
  const result = task.result || {};
  const org = typeof metadata.org === 'string' ? metadata.org : result.org || '';
  const repo = typeof metadata.repo === 'string' ? metadata.repo : result.repo || '';
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
  const steps = Array.isArray(task.steps) ? task.steps : [];

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
        ? steps.map((step, index) => h(TaskStep, { key: step.id || `step-${index}`, step, index }))
        : h('p', { className: 'text-xs text-neutral-400' }, 'No steps reported yet.'),
      status === 'failed' && task.error && task.error.message
        ? h(
            'div',
            {
              className:
                'rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200',
            },
            task.error.message,
          )
        : null,
    ),
  );
}

