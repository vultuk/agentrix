/**
 * Worktree API service
 */

import { apiPost, apiDelete } from './api-client.js';
import type { RepositoryData } from '../../types/domain.js';

interface CreateWorktreeResponse {
  taskId: string;
  [key: string]: unknown;
}

interface DeleteWorktreeResponse {
  data: RepositoryData;
}

/**
 * Create a new worktree
 */
export async function createWorktree(
  org: string,
  repo: string,
  branch: string | null = null,
  prompt: string | null = null
): Promise<{ taskId: string; data: unknown }> {
  const body: { org: string; repo: string; branch?: string; prompt?: string } = { org, repo };
  if (branch) {
    body.branch = branch;
  }
  if (prompt) {
    body.prompt = prompt;
  }

  const data = await apiPost<CreateWorktreeResponse>(
    '/api/worktrees',
    body,
    { errorPrefix: 'Failed to create worktree' }
  );

  return {
    taskId: data && typeof data.taskId === 'string' ? data.taskId : '',
    data: data,
  };
}

/**
 * Delete a worktree
 */
export async function deleteWorktree(org: string, repo: string, branch: string): Promise<RepositoryData> {
  const response = await apiDelete<DeleteWorktreeResponse>(
    '/api/worktrees',
    { org, repo, branch },
    { errorPrefix: 'Failed to delete worktree' }
  );
  return response.data || {};
}

