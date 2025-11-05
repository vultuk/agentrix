import { discoverRepositories } from '../repositories/repository-repository.js';
import { emitReposUpdate } from '../core/event-bus.js';
import type { RepositoriesMap } from '../repositories/repository-repository.js';

/**
 * Refreshes the repository cache by discovering repositories and emitting an update event
 * @param workdir - Work directory root
 * @returns Updated repository data
 */
export async function refreshRepositoryCache(workdir: string): Promise<RepositoriesMap> {
  const data = await discoverRepositories(workdir);
  emitReposUpdate(data);
  return data;
}

