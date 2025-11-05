import {
  validateRequired,
  validateOptional,
  requireNonEmpty,
} from '../request-validator.js';

export interface RepositoryCreateInput {
  url: string;
  initCommand: string;
}

export interface RepositoryDeleteInput {
  org: string;
  repo: string;
}

export interface InitCommandUpdateInput {
  org: string;
  repo: string;
  initCommand: string;
}

/**
 * Validates a repository creation request
 */
export function validateRepositoryCreate(payload: unknown): RepositoryCreateInput {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid request payload');
  }

  const data = payload as Record<string, unknown>;
  const url = requireNonEmpty(data['url'] || data['repoUrl'], 'Repository URL');
  const { initCommand } = validateOptional(data, { initCommand: '' });

  return { url, initCommand };
}

/**
 * Validates a repository deletion request
 */
export function validateRepositoryDelete(payload: unknown): RepositoryDeleteInput {
  return validateRequired(payload, ['org', 'repo'] as const);
}

/**
 * Validates an init command update request
 */
export function validateInitCommandUpdate(payload: unknown): InitCommandUpdateInput {
  const { org, repo } = validateRequired(payload, ['org', 'repo'] as const);
  const data = payload as Record<string, unknown>;
  const initCommand = typeof data['initCommand'] === 'string' 
    ? data['initCommand'] as string
    : '';

  return { org, repo, initCommand };
}
