/**
 * Repository API service
 */

import { apiGet, apiPost, apiDelete } from './api-client.js';
import type { Commands, IssueDetails, RepositoryData, RepositoryDashboard } from '../../types/domain.js';

interface RepositoryListResponse {
  data: RepositoryData;
}

interface AddRepositoryResponse {
  data: RepositoryData;
  repo: { org: string; repo: string };
}

interface DeleteRepositoryResponse {
  data: RepositoryData;
}

interface UpdateInitCommandResponse {
  data: RepositoryData;
}

/**
 * Fetch all repositories
 */
export async function fetchRepositories(): Promise<RepositoryData> {
  const response = await apiGet<RepositoryListResponse>('/api/repos', {
    errorPrefix: 'Failed to fetch repositories'
  });
  return response.data || {};
}

/**
 * Add a new repository
 */
export async function addRepository(remoteUrl: string, initCommand = ''): Promise<{ data: RepositoryData; repo: { org: string; repo: string } | null }> {
  const response = await apiPost<AddRepositoryResponse>(
    '/api/repos',
    { url: remoteUrl, initCommand },
    { errorPrefix: 'Failed to add repository' }
  );
  
  return {
    data: response.data || {},
    repo: response.repo || null,
  };
}

/**
 * Fetch repository dashboard data
 */
export async function fetchRepositoryDashboard(org: string, repo: string): Promise<RepositoryDashboard | null> {
  const params = new URLSearchParams({ org, repo });
  const response = await apiGet<{ data: RepositoryDashboard }>(
    `/api/repos/dashboard?${params.toString()}`,
    { errorPrefix: 'Failed to load repository dashboard' }
  );
  return response.data || null;
}

/**
 * Fetch issue details
 */
export async function fetchIssue(org: string, repo: string, issueNumber: number): Promise<IssueDetails> {
  const params = new URLSearchParams({
    org,
    repo,
    issue: String(issueNumber)
  });

  const response = await apiGet<{ data: { issue: unknown; fetchedAt?: string } }>(
    `/api/repos/issue?${params.toString()}`,
    { errorPrefix: `Unable to load issue #${issueNumber}` }
  );

  const payload = response.data;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Issue details missing from response');
  }

  const issue = payload.issue;
  if (!issue || typeof issue !== 'object') {
    throw new Error('Issue details missing from response');
  }

  const fetchedAt =
    typeof payload.fetchedAt === 'string' && payload.fetchedAt
      ? payload.fetchedAt
      : new Date().toISOString();

  return {
    issue,
    fetchedAt,
  };
}

/**
 * Delete a repository
 */
export async function deleteRepository(org: string, repo: string): Promise<RepositoryData> {
  const response = await apiDelete<DeleteRepositoryResponse>(
    '/api/repos',
    { org, repo },
    { errorPrefix: 'Failed to delete repository' }
  );
  return response.data || {};
}

/**
 * Update repository init command
 */
export async function updateInitCommand(org: string, repo: string, initCommand: string): Promise<RepositoryData> {
  const response = await apiPost<UpdateInitCommandResponse>(
    '/api/repos/init-command',
    { org, repo, initCommand },
    { errorPrefix: 'Failed to update init command' }
  );
  return response.data || {};
}

/**
 * Fetch command configuration
 */
export async function fetchCommands(): Promise<Commands | null> {
  const response = await apiGet<{ commands: Commands }>(
    '/api/commands',
    { errorPrefix: 'Failed to fetch commands' }
  );
  return response.commands || null;
}

