/**
 * Task-related constants and configurations
 */

/** Human-readable labels for task statuses */
export const TASK_STATUS_LABELS = Object.freeze({
  pending: 'Pending',
  running: 'Running',
  succeeded: 'Completed',
  failed: 'Failed',
  skipped: 'Skipped',
});

/** Tailwind CSS classes for task status badges */
export const TASK_STATUS_BADGE_CLASSES = Object.freeze({
  pending: 'bg-neutral-700/60 text-neutral-200',
  running: 'bg-sky-500/20 text-sky-300',
  succeeded: 'bg-emerald-500/20 text-emerald-300',
  failed: 'bg-rose-500/20 text-rose-200',
  skipped: 'bg-neutral-700/40 text-neutral-300',
});

/** Tailwind CSS classes for task status indicators */
export const TASK_STATUS_INDICATOR_CLASSES = Object.freeze({
  pending: 'bg-neutral-500/70',
  running: 'bg-sky-400',
  succeeded: 'bg-emerald-400',
  failed: 'bg-rose-500',
  skipped: 'bg-neutral-600/80',
});

