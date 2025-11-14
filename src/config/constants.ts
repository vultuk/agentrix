export const DEFAULT_HOST = '0.0.0.0';
export const DEFAULT_PORT = 3414;
export const MAX_TERMINAL_BUFFER = 200000;
export const PASSWORD_LENGTH = 12;
export const SESSION_COOKIE_NAME = 'terminal_worktree_session';
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;
export const TMUX_BIN = 'tmux';
export const TMUX_SESSION_PREFIX = 'tw-';
export const MAX_REQUEST_BODY_SIZE = 1024 * 1024;

export const AUTH_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
export const AUTH_RATE_LIMIT_MAX_ATTEMPTS = 5;
export const AUTOMATION_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const AUTOMATION_RATE_LIMIT_MAX_ATTEMPTS = 5;

/** HTTP Status Codes */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

/** Common error messages */
export const ERROR_MESSAGES = {
  AUTH_REQUIRED: 'Authentication required',
  INVALID_PASSWORD: 'Invalid password',
  INVALID_PAYLOAD: 'Invalid request payload',
  TOO_MANY_LOGIN_ATTEMPTS: 'Too many failed login attempts. Try again later.',
  TOO_MANY_AUTOMATION_ATTEMPTS: 'Automation requests are temporarily blocked. Try again later.',
  REPOSITORY_NOT_FOUND: 'Repository not found',
  WORKTREE_NOT_FOUND: 'Worktree not found',
  SESSION_NOT_FOUND: 'Terminal session not found',
  METHOD_NOT_ALLOWED: 'Method Not Allowed',
} as const;
