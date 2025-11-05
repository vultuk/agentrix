/**
 * Git operations API service
 */

import { apiGet, apiPost } from './api-client.js';
import type { GitStatus } from '../../types/domain.js';
import type { DiffData } from '../../types/api.js';

interface GitStatusResponse {
  status: GitStatus;
}

/**
 * Fetch Git status for a worktree
 */
export async function fetchGitStatus(
  org: string,
  repo: string,
  branch: string,
  entryLimit?: number,
  commitLimit?: number
): Promise<GitStatus | null> {
  const params = new URLSearchParams({ org, repo, branch });
  if (Number.isFinite(entryLimit)) {
    params.set('entryLimit', String(entryLimit));
  }
  if (Number.isFinite(commitLimit)) {
    params.set('commitLimit', String(commitLimit));
  }

  const response = await apiGet<GitStatusResponse>(
    `/api/git/status?${params.toString()}`,
    { errorPrefix: 'Failed to fetch git status' }
  );
  
  return response.status || null;
}

/**
 * Fetch diff for a file
 */
export async function fetchDiff(
  org: string,
  repo: string,
  branch: string,
  path: string,
  previousPath: string | null = null,
  mode = 'changes',
  status = ''
): Promise<DiffData> {
  const body = await apiPost<DiffData>(
    '/api/git/diff',
    {
      org,
      repo,
      branch,
      path,
      previousPath,
      mode,
      status,
    },
    { errorPrefix: 'Failed to load diff' }
  );

  const payload = body && typeof body === 'object' ? body : null;
  
  return {
    diff: payload && typeof payload.diff === 'string' ? payload.diff : '',
    path: payload?.path || path,
    previousPath: payload?.previousPath ?? previousPath,
    mode: payload?.mode || mode,
    status: payload?.status || status,
  };
}

