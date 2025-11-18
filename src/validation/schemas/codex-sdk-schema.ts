import { validateRequired, requireNonEmpty } from '../request-validator.js';

export interface CodexSessionWorktreeInput {
  org: string;
  repo: string;
  branch: string;
}

export interface CodexSessionCreateInput extends CodexSessionWorktreeInput {
  label?: string;
  initialMessage?: string;
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
  const providedInitialMessage = (payload as { initialMessage?: string }).initialMessage;
  const initialMessageRaw =
    typeof providedInitialMessage === 'string' ? providedInitialMessage.trim() : undefined;
  return {
    ...base,
    label,
    initialMessage: initialMessageRaw && initialMessageRaw.length > 0 ? initialMessageRaw : undefined,
  };
}

export function validateCodexSessionId(payload: unknown): CodexSessionIdInput {
  const { sessionId } = validateRequired(payload, ['sessionId'] as const);
  return { sessionId: requireNonEmpty(sessionId, 'sessionId') };
}
