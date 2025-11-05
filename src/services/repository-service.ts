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
    return await discoverRepositories(this.workdir);
  }

  /**
   * Adds a new repository
   * @param repositoryUrl - Git repository URL
   * @param initCommand - Optional init command
   * @returns Result with repository data
   */
  async addRepository(repositoryUrl: string, initCommand: string = ''): Promise<AddRepositoryResult> {
    const repoInfo = await cloneRepository(this.workdir, repositoryUrl, { initCommand });
    const data = await refreshRepositoryCache(this.workdir);
    return { data, repo: repoInfo };
  }

  /**
   * Removes a repository
   * @param org - Organization name
   * @param repo - Repository name
   * @returns Updated repository data
   */
  async deleteRepository(org: string, repo: string): Promise<RepositoriesData> {
    await removeRepository(this.workdir, org, repo);
    return await refreshRepositoryCache(this.workdir);
  }

  /**
   * Updates the init command for a repository
   * @param org - Organization name
   * @param repo - Repository name
   * @param initCommand - New init command
   * @returns Updated repository data
   */
  async updateInitCommand(org: string, repo: string, initCommand: string): Promise<RepositoriesData> {
    const { repoRoot } = await ensureRepository(this.workdir, org, repo);
    await setRepositoryInitCommand(repoRoot, initCommand);
    return await refreshRepositoryCache(this.workdir);
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
