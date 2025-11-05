import { validateRequired } from '../request-validator.js';

export interface WorktreeCreateInput {
  org: string;
  repo: string;
  branch: string;
  prompt: string;
  hasPrompt: boolean;
}

export interface WorktreeDeleteInput {
  org: string;
  repo: string;
  branch: string;
}

/**
 * Validates a worktree creation request
 */
export function validateWorktreeCreate(payload: unknown): WorktreeCreateInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid request payload');
  }

  const data = payload as Record<string, unknown>;
  const { org, repo } = validateRequired(data, ['org', 'repo'] as const);

  const branchInput = typeof data['branch'] === 'string' ? data['branch'].trim() : '';
  const rawPrompt = typeof data['prompt'] === 'string' ? data['prompt'] : '';
  const prompt = rawPrompt.trim();

  return {
    org,
    repo,
    branch: branchInput,
    prompt,
    hasPrompt: Boolean(prompt),
  };
}

/**
 * Validates a worktree deletion request
 */
export function validateWorktreeDelete(payload: unknown): WorktreeDeleteInput {
  const { org, repo, branch } = validateRequired(payload, ['org', 'repo', 'branch'] as const);
  return { org, repo, branch };
}
