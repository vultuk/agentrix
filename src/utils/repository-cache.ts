import { discoverRepositories } from '../repositories/repository-repository.js';
import { emitReposUpdate } from '../core/event-bus.js';
import type { RepositoriesMap } from '../repositories/repository-repository.js';

interface Dependencies {
  discoverRepositories: typeof discoverRepositories;
  emitReposUpdate: typeof emitReposUpdate;
}

const defaultDependencies: Dependencies = {
  discoverRepositories,
  emitReposUpdate,
};

let activeDependencies: Dependencies = { ...defaultDependencies };

/**
 * @internal Utility for tests to override repository discovery dependencies
 */
export function __setRepositoryCacheTestOverrides(overrides?: Partial<Dependencies>): void {
  if (!overrides) {
    activeDependencies = { ...defaultDependencies };
    return;
  }
  activeDependencies = { ...activeDependencies, ...overrides };
}

/**
 * Refreshes the repository cache by discovering repositories and emitting an update event
 * @param workdir - Work directory root
 * @returns Updated repository data
 */
export async function refreshRepositoryCache(workdir: string): Promise<RepositoriesMap> {
  const data = await activeDependencies.discoverRepositories(workdir);
  activeDependencies.emitReposUpdate(data);
  return data;
}

