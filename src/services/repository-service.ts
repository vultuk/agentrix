import { cloneRepository, discoverRepositories, ensureRepository } from '../repositories/repository-repository.js';
import { setRepositoryInitCommand } from '../core/repository-config.js';
import { removeRepository } from '../core/repositories.js';
import { refreshRepositoryCache } from '../utils/repository-cache.js';
import type { IRepositoryService } from '../types/services.js';

export interface RepositoriesData {
  [org: string]: {
    [repo: string]: {
      branches: string[];
      initCommand: string;
    };
  };
}

export interface AddRepositoryResult {
  data: RepositoriesData;
  repo: {
    org: string;
    repo: string;
  };
}

type RepositoryServiceDependencyOverrides = Partial<{
  discoverRepositories: typeof discoverRepositories;
  cloneRepository: typeof cloneRepository;
  refreshRepositoryCache: typeof refreshRepositoryCache;
  removeRepository: typeof removeRepository;
  ensureRepository: typeof ensureRepository;
  setRepositoryInitCommand: typeof setRepositoryInitCommand;
}>;

const repositoryServiceDependencies = {
  discoverRepositories,
  cloneRepository,
  refreshRepositoryCache,
  removeRepository,
  ensureRepository,
  setRepositoryInitCommand,
} as const;

let repositoryServiceTestOverrides: RepositoryServiceDependencyOverrides | null = null;

function resolveRepositoryServiceDependency<K extends keyof typeof repositoryServiceDependencies>(
  key: K
): (typeof repositoryServiceDependencies)[K] {
  const overrides = repositoryServiceTestOverrides || {};
  const override = overrides[key];
  if (override) {
    return override as (typeof repositoryServiceDependencies)[K];
  }
  return repositoryServiceDependencies[key];
}

export function __setRepositoryServiceTestOverrides(overrides?: RepositoryServiceDependencyOverrides): void {
  repositoryServiceTestOverrides = overrides ?? null;
}

/**
 * Service for repository management operations
 */
export class RepositoryService implements IRepositoryService {
  constructor(private readonly workdir: string) {}

  /**
   * Lists all repositories
   * @returns Repository data
   */
  async listRepositories(): Promise<RepositoriesData> {
    const discover = resolveRepositoryServiceDependency('discoverRepositories');
    return await discover(this.workdir);
  }

  /**
   * Adds a new repository
   * @param repositoryUrl - Git repository URL
   * @param initCommand - Optional init command
   * @returns Result with repository data
   */
  async addRepository(repositoryUrl: string, initCommand: string = ''): Promise<AddRepositoryResult> {
    const clone = resolveRepositoryServiceDependency('cloneRepository');
    const refresh = resolveRepositoryServiceDependency('refreshRepositoryCache');

    const repoInfo = await clone(this.workdir, repositoryUrl, { initCommand });
    const data = await refresh(this.workdir);
    return { data, repo: repoInfo };
  }

  /**
   * Removes a repository
   * @param org - Organization name
   * @param repo - Repository name
   * @returns Updated repository data
   */
  async deleteRepository(org: string, repo: string): Promise<RepositoriesData> {
    const remove = resolveRepositoryServiceDependency('removeRepository');
    const refresh = resolveRepositoryServiceDependency('refreshRepositoryCache');

    await remove(this.workdir, org, repo);
    return await refresh(this.workdir);
  }

  /**
   * Updates the init command for a repository
   * @param org - Organization name
   * @param repo - Repository name
   * @param initCommand - New init command
   * @returns Updated repository data
   */
  async updateInitCommand(org: string, repo: string, initCommand: string): Promise<RepositoriesData> {
    const ensure = resolveRepositoryServiceDependency('ensureRepository');
    const setInit = resolveRepositoryServiceDependency('setRepositoryInitCommand');
    const refresh = resolveRepositoryServiceDependency('refreshRepositoryCache');

    const { repoRoot } = await ensure(this.workdir, org, repo);
    await setInit(repoRoot, initCommand);
    return await refresh(this.workdir);
  }
}

/**
 * Creates a repository service instance
 * @param workdir - Work directory root
 * @returns RepositoryService instance
 */
export function createRepositoryService(workdir: string): RepositoryService {
  return new RepositoryService(workdir);
}
