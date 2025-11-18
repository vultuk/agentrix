import { apiDelete, apiGet, apiPost } from './api-client.js';
import type { CodexSdkSessionDetail, CodexSdkSessionSummary } from '../../types/codex-sdk.js';

export interface CreateCodexSessionOptions {
  label?: string;
  initialMessage?: string;
}

export async function listCodexSessions(org: string, repo: string, branch: string): Promise<CodexSdkSessionSummary[]> {
  const params = new URLSearchParams({ org, repo, branch });
  const response = await apiGet<{ sessions: CodexSdkSessionSummary[] }>(
    `/api/codex-sdk/sessions?${params.toString()}`,
    { errorPrefix: 'Failed to load Codex sessions' },
  );
  return response.sessions ?? [];
}

export async function createCodexSession(
  org: string,
  repo: string,
  branch: string,
  options: CreateCodexSessionOptions = {},
): Promise<CodexSdkSessionDetail> {
  const payload: { org: string; repo: string; branch: string; label?: string; initialMessage?: string } = {
    org,
    repo,
    branch,
  };
  if (options.label) {
    payload.label = options.label;
  }
  if (options.initialMessage) {
    payload.initialMessage = options.initialMessage;
  }
  const body = await apiPost<CodexSdkSessionDetail>(
    '/api/codex-sdk/sessions',
    payload,
    { errorPrefix: 'Failed to start Codex session' },
  );
  return body;
}

export async function fetchCodexSession(sessionId: string): Promise<CodexSdkSessionDetail> {
  return apiGet<CodexSdkSessionDetail>(`/api/codex-sdk/sessions/${sessionId}`, {
    errorPrefix: 'Failed to load Codex session',
  });
}

export async function deleteCodexSession(sessionId: string): Promise<void> {
  await apiDelete(`/api/codex-sdk/sessions/${sessionId}`, undefined, {
    errorPrefix: 'Failed to close Codex session',
  });
}

export function getCodexSdkSocketUrl(sessionId: string): string {
  if (!sessionId) {
    throw new Error('sessionId is required to connect Codex SDK WebSocket');
  }
  if (typeof window === 'undefined' || !window.location) {
    throw new Error('Cannot determine Codex SDK socket URL outside the browser');
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({ sessionId });
  return `${protocol}//${window.location.host}/api/codex-sdk/socket?${params.toString()}`;
}
