import { validateRequired, requireNonEmpty } from '../request-validator.js';
import { ValidationError } from '../../infrastructure/errors/index.js';

export interface TerminalOpenInput {
  org: string;
  repo: string;
  branch: string;
  command: string;
  hasPrompt: boolean;
  prompt?: string;
  sessionId?: string;
  newSession?: boolean;
  sessionTool?: 'terminal' | 'agent';
}

export interface TerminalSendInput {
  sessionId: string;
  input: string;
}

export interface TerminalCloseInput {
  sessionId: string;
}

/**
 * Validates a terminal open request
 */
export function validateTerminalOpen(payload: unknown): TerminalOpenInput {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Invalid request payload');
  }

  const data = payload as Record<string, unknown>;
  const { org, repo, branch } = validateRequired(data, ['org', 'repo', 'branch'] as const);

  if (branch.toLowerCase() === 'main') {
    throw new ValidationError('Terminal access to the main branch is disabled');
  }

  const command = typeof data['command'] === 'string' ? data['command'].trim() : '';
  const hasPrompt = Object.prototype.hasOwnProperty.call(data, 'prompt');
  const prompt = hasPrompt ? data['prompt'] : undefined;
  const sessionIdValue = typeof data['sessionId'] === 'string' ? data['sessionId'].trim() : '';
  const sessionId = sessionIdValue ? sessionIdValue : undefined;
  const newSession = typeof data['newSession'] === 'boolean' ? data['newSession'] : false;
  const rawSessionTool = typeof data['sessionTool'] === 'string' ? data['sessionTool'].trim().toLowerCase() : '';
  let sessionTool: 'terminal' | 'agent' | undefined;
  if (rawSessionTool) {
    if (rawSessionTool !== 'terminal' && rawSessionTool !== 'agent') {
      throw new ValidationError('sessionTool must be "terminal" or "agent" when provided');
    }
    sessionTool = rawSessionTool;
  }

  if (hasPrompt && typeof prompt !== 'string') {
    throw new ValidationError('prompt must be a string');
  }

  if (hasPrompt && !command) {
    throw new ValidationError('command must be provided when prompt is included');
  }

  if (sessionId && newSession) {
    throw new ValidationError('sessionId cannot be combined with newSession');
  }

  if (sessionId && hasPrompt) {
    throw new ValidationError('sessionId cannot be combined with prompt');
  }

  if (newSession && hasPrompt) {
    throw new ValidationError('newSession cannot be combined with prompt');
  }

  return {
    org,
    repo,
    branch,
    command,
    hasPrompt,
    prompt: prompt as string | undefined,
    sessionId,
    newSession,
    sessionTool,
  };
}

/**
 * Validates a terminal send input request
 */
export function validateTerminalSend(payload: unknown): TerminalSendInput {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Invalid request payload');
  }

  const data = payload as Record<string, unknown>;
  const sessionId = requireNonEmpty(data['sessionId'], 'sessionId');
  const input = typeof data['input'] === 'string' ? data['input'] : '';

  return { sessionId, input };
}

/**
 * Validates a terminal close request
 */
export function validateTerminalClose(payload: unknown): TerminalCloseInput {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('Invalid request payload');
  }
  const data = payload as Record<string, unknown>;
  const sessionId = requireNonEmpty(data['sessionId'], 'sessionId');
  return { sessionId };
}
