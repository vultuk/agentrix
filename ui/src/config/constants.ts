/**
 * Application-wide constants
 */

/** Polling interval for repository list updates (milliseconds) */
export const REPOSITORY_POLL_INTERVAL_MS = 60000;

/** Polling interval for repository dashboard updates (milliseconds) */
export const REPOSITORY_DASHBOARD_POLL_INTERVAL_MS = 60000;

/** Polling interval for session updates (milliseconds) */
export const SESSION_POLL_INTERVAL_MS = 60000;

/** LocalStorage key for organisation collapse state */
export const ORGANISATION_COLLAPSE_STORAGE_KEY = 'terminal-worktree:collapsed-organisations';

/** Available prompt editor tabs */
export const PROMPT_EDITOR_TABS = Object.freeze([
  { value: 'edit', label: 'Edit' },
  { value: 'preview', label: 'Preview' }
]);

/** Action button CSS class */
export const ACTION_BUTTON_CLASS = 'inline-flex h-7 w-7 items-center justify-center rounded-md shrink-0 transition-colors';

/** Tolerance for activity timestamp acknowledgement (milliseconds) */
export const ACKNOWLEDGEMENT_ACTIVITY_TOLERANCE_MS = 1500;

/** Common CSS class for form inputs */
export const INPUT_CLASS = 'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60';

/** Common CSS class for disabled form elements */
export const DISABLED_CLASS = 'disabled:cursor-not-allowed disabled:opacity-65';

/** Common CSS class for ghost button */
export const GHOST_BUTTON_CLASS = 'px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200';

/** Common CSS class for primary button */
export const PRIMARY_BUTTON_CLASS = 'px-3 py-2 text-sm bg-emerald-500/80 hover:bg-emerald-400 text-neutral-900 font-medium rounded-md transition-colors';

/** Common CSS class for danger button */
export const DANGER_BUTTON_CLASS = 'px-3 py-2 text-sm bg-rose-600 hover:bg-rose-500 text-white font-medium rounded-md transition-colors';

/** Common minimum height for textareas (px) */
export const TEXTAREA_MIN_HEIGHT = 92;

