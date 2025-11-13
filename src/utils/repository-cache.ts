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
let repositoryCacheSnapshot: RepositoriesMap | null = null;

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
 * Retrieves the current repository cache snapshot, if any
 */
export function getRepositoryCacheSnapshot(): RepositoriesMap | null {
  return repositoryCacheSnapshot;
}

/**
 * @internal Utility for tests to set the repository cache snapshot
 */
export function __setRepositoryCacheSnapshot(snapshot: RepositoriesMap | null): void {
  repositoryCacheSnapshot = snapshot;
}

/**
 * Refreshes the repository cache by discovering repositories and emitting an update event
 * @param workdir - Work directory root
 * @returns Updated repository data
 */
export async function refreshRepositoryCache(workdir: string): Promise<RepositoriesMap> {
  try {
    const data = await activeDependencies.discoverRepositories(workdir);
    repositoryCacheSnapshot = data;
    activeDependencies.emitReposUpdate(data);
    return data;
  } catch (error) {
    repositoryCacheSnapshot = null;
    throw error;
  }
}
