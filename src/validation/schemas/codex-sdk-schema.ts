import { validateRequired, requireNonEmpty } from '../request-validator.js';

export interface CodexSessionWorktreeInput {
  org: string;
  repo: string;
  branch: string;
}

export interface CodexSessionCreateInput extends CodexSessionWorktreeInput {
  label?: string;
}

export interface CodexSessionIdInput {
  sessionId: string;
}

export function validateCodexSessionList(payload: unknown): CodexSessionWorktreeInput {
  return validateRequired(payload, ['org', 'repo', 'branch'] as const);
}

export function validateCodexSessionCreate(payload: unknown): CodexSessionCreateInput {
  const base = validateCodexSessionList(payload);
  const label = typeof (payload as { label?: string }).label === 'string' ? (payload as { label?: string }).label : undefined;
  return {
    ...base,
    label,
  };
}

export function validateCodexSessionId(payload: unknown): CodexSessionIdInput {
  const { sessionId } = validateRequired(payload, ['sessionId'] as const);
  return { sessionId: requireNonEmpty(sessionId, 'sessionId') };
}
