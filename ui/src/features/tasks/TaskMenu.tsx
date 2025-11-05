import React from 'react';
import { X, ListTodo, Loader2 } from 'lucide-react';
import TaskCard from './TaskCard.js';
import { ACTION_BUTTON_CLASS } from '../../utils/constants.js';
import type { Task } from '../../types/domain.js';

const { createElement: h } = React;

interface TaskMenuProps {
  tasks: Task[];
  isOpen: boolean;
  onToggle: () => void;
  hasRunning: boolean;
  menuRef: React.RefObject<HTMLDivElement>;
}

export default function TaskMenu({ tasks, isOpen, onToggle, hasRunning, menuRef }: TaskMenuProps) {
  const taskList = Array.isArray(tasks) ? tasks : [];
  const runningCount = taskList.reduce((total, task) => {
    if (task && (task.status === 'pending' || task.status === 'running')) {
      return total + 1;
    }
    return total;
  }, 0);

  const totalCount = taskList.length;
  const dropdownContent = totalCount
    ? taskList.map((task) => h(TaskCard, { key: task.id, task }))
    : h(
        'div',
        { className: 'px-4 py-6 text-sm text-neutral-400 text-center' },
        'No tasks have been recorded yet.',
      );

  return h(
    'div',
    { className: 'relative', ref: menuRef },
    h(
      'button',
      {
        type: 'button',
        onClick: onToggle,
        className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`,
        'aria-haspopup': 'true',
        'aria-expanded': isOpen ? 'true' : 'false',
        title: runningCount
          ? `${runningCount} task${runningCount === 1 ? '' : 's'} in progress`
          : totalCount
          ? `${totalCount} recent task${totalCount === 1 ? '' : 's'}`
          : 'No tasks running',
      },
      hasRunning
        ? h(Loader2, { size: 16, className: 'animate-spin text-emerald-400' })
        : h(ListTodo, { size: 16 }),
    ),
    isOpen
      ? h(
          'div',
          {
            className:
              'absolute right-0 top-full mt-2 w-[24rem] max-h-[70vh] overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl z-40',
          },
          h(
            'div',
            {
              className:
                'flex items-center justify-between border-b border-neutral-800 bg-neutral-900/70 px-4 py-3',
            },
            h(
              'div',
              null,
              h('p', { className: 'text-sm font-medium text-neutral-100' }, 'Tasks'),
              h(
                'p',
                { className: 'text-xs text-neutral-400' },
                runningCount
                  ? `${runningCount} running • ${totalCount} total`
                  : `${totalCount} total`,
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: onToggle,
                className: 'rounded-md p-1 text-neutral-400 transition hover:text-neutral-100',
                'aria-label': 'Close tasks menu',
              },
              h(X, { size: 16 }),
            ),
          ),
          h('div', { className: 'space-y-3 px-3 py-4' }, dropdownContent),
        )
      : null,
  );
}

