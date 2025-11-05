/**
 * Terminal session API service
 */

import { apiGet, apiPost } from './api-client.js';
import type { TerminalSession } from '../../types/domain.js';

interface FetchSessionsResponse {
  sessions: TerminalSession[];
}

interface OpenTerminalResponse {
  sessionId: string;
  created: boolean;
  log: string;
}

/**
 * Fetch all terminal sessions
 */
export async function fetchSessions(): Promise<TerminalSession[]> {
  const response = await apiGet<FetchSessionsResponse>(
    '/api/sessions',
    { errorPrefix: 'Failed to fetch sessions' }
  );
  return response.sessions || [];
}

/**
 * Open or resume a terminal session
 */
export async function openTerminal(
  org: string,
  repo: string,
  branch: string,
  initCommand: string | null = null,
  prompt: string | null = null
): Promise<{ sessionId: string | null; created: boolean; log: string }> {
  const payload: { org: string; repo: string; branch: string; command?: string; prompt?: string } = { org, repo, branch };
  if (initCommand !== undefined && initCommand !== null) {
    payload.command = initCommand;
  }
  if (prompt !== undefined && prompt !== null && typeof prompt === 'string') {
    payload.prompt = prompt;
  }

  const body = await apiPost<OpenTerminalResponse>(
    '/api/terminal/open',
    payload,
    { errorPrefix: 'Failed to open terminal' }
  );

  return {
    sessionId: body && body.sessionId ? body.sessionId : null,
    created: body && typeof body.created === 'boolean' ? body.created : false,
    log: body && typeof body.log === 'string' ? body.log : '',
  };
}

/**
 * Send input to a terminal session
 */
export async function sendTerminalInput(org: string, repo: string, branch: string, data: string): Promise<boolean> {
  const response = await fetch('/api/terminal/input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ org, repo, branch, data })
  });

  if (!response.ok) {
    throw new Error('Failed to send input');
  }

  return true;
}

/**
 * Resize a terminal session
 */
export async function resizeTerminal(org: string, repo: string, branch: string, cols: number, rows: number): Promise<boolean> {
  const response = await fetch('/api/terminal/resize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ org, repo, branch, cols, rows })
  });

  if (!response.ok) {
    throw new Error('Failed to resize terminal');
  }

  return true;
}

/**
 * Get WebSocket URL for terminal
 */
export function getTerminalWebSocketUrl(org: string, repo: string, branch: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams({ org, repo, branch });
  return `${protocol}//${window.location.host}/api/terminal/socket?${params.toString()}`;
}

