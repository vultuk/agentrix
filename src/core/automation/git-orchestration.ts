/**
 * Git/worktree orchestration helpers used by the automation task runner.
 */
import { refreshRepositoryCache } from '../../utils/repository-cache.js';

export interface EnsureRepositoryReadyParams {
  ensureRepositoryExists: (workdir: string, org: string, repo: string) => Promise<{ repositoryPath: string; cloned: boolean }>;
  workdir: string;
  org: string;
  repo: string;
}

export interface EnsureWorktreeReadyParams {
  ensureWorktreeExists: (workdir: string, org: string, repo: string, branch: string, options?: unknown) => Promise<{ worktreePath: string; created: boolean }>;
  workdir: string;
  org: string;
  repo: string;
  branch: string;
  defaultBranchOverride?: string;
}

export interface RefreshRepositoryViewsParams {
  refreshCache: (workdir: string) => Promise<unknown>;
  workdir: string;
}

export interface GitOrchestrator {
  ensureRepositoryReady(args: Omit<EnsureRepositoryReadyParams, 'ensureRepositoryExists'>): Promise<{ repositoryPath: string; clonedRepository: boolean }>;
  ensureWorktreeReady(args: Omit<EnsureWorktreeReadyParams, 'ensureWorktreeExists'>): Promise<{ worktreePath: string; createdWorktree: boolean }>;
  refreshRepositoryViews(args: Omit<RefreshRepositoryViewsParams, 'refreshCache'>): Promise<void>;
}

export async function ensureRepositoryReady({
  ensureRepositoryExists,
  workdir,
  org,
  repo,
}: EnsureRepositoryReadyParams): Promise<{ repositoryPath: string; clonedRepository: boolean }> {
  const { repositoryPath, cloned } = await ensureRepositoryExists(workdir, org, repo);
  return { repositoryPath, clonedRepository: cloned };
}

export async function ensureWorktreeReady({
  ensureWorktreeExists,
  workdir,
  org,
  repo,
  branch,
  defaultBranchOverride,
}: EnsureWorktreeReadyParams): Promise<{ worktreePath: string; createdWorktree: boolean }> {
  const { worktreePath, created } = await ensureWorktreeExists(workdir, org, repo, branch, {
    defaultBranchOverride,
  });

  return { worktreePath, createdWorktree: created };
}

export async function refreshRepositoryViews({
  refreshCache,
  workdir,
}: RefreshRepositoryViewsParams): Promise<void> {
  await refreshCache(workdir);
}

export interface GitOrchestratorConfig {
  ensureRepositoryExists: EnsureRepositoryReadyParams['ensureRepositoryExists'];
  ensureWorktreeExists: EnsureWorktreeReadyParams['ensureWorktreeExists'];
  refreshCache?: RefreshRepositoryViewsParams['refreshCache'];
}

export function createGitOrchestrator({
  ensureRepositoryExists,
  ensureWorktreeExists,
  refreshCache = refreshRepositoryCache,
}: GitOrchestratorConfig): GitOrchestrator {
  return {
    ensureRepositoryReady: (args) =>
      ensureRepositoryReady({ ensureRepositoryExists, ...args }),
    ensureWorktreeReady: (args) =>
      ensureWorktreeReady({ ensureWorktreeExists, ...args }),
    refreshRepositoryViews: (args) =>
      refreshRepositoryViews({ refreshCache, ...args }),
  };
}
