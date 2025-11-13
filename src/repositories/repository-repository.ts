import fs from 'node:fs/promises';
import path from 'node:path';
import { executeGitCommand, extractGitErrorMessage, GIT_BUFFER_SIZES } from './git-repository.js';
import { listWorktrees } from './worktree-repository.js';
import { parseRepositoryUrl } from '../domain/index.js';
import { getRepositoryInitCommand } from '../core/repository-config.js';
import { normaliseInitCommand, setRepositoryInitCommand } from '../core/repository-config.js';
import { resolveRepositoryPaths, type RepositoryPaths } from './repository-paths.js';

export interface CloneResult {
  org: string;
  repo: string;
}

export interface CloneOptions {
  initCommand?: string;
}

export interface RepositoriesMap {
  [org: string]: {
    [repo: string]: {
      branches: string[];
      initCommand: string;
    };
  };
}

type RepositoryRepositoryDependencyOverrides = Partial<{
  executeGitCommand: typeof executeGitCommand;
  listWorktrees: typeof listWorktrees;
  getRepositoryInitCommand: typeof getRepositoryInitCommand;
  normaliseInitCommand: typeof normaliseInitCommand;
  setRepositoryInitCommand: typeof setRepositoryInitCommand;
}>;

const repositoryRepositoryDependencies = {
  executeGitCommand,
  listWorktrees,
  getRepositoryInitCommand,
  normaliseInitCommand,
  setRepositoryInitCommand,
} as const;

let repositoryRepositoryTestOverrides: RepositoryRepositoryDependencyOverrides | null = null;

function resolveRepositoryRepositoryDependency<K extends keyof typeof repositoryRepositoryDependencies>(
  key: K
): (typeof repositoryRepositoryDependencies)[K] {
  const overrides = repositoryRepositoryTestOverrides || {};
  const override = overrides[key];
  if (override) {
    return override as (typeof repositoryRepositoryDependencies)[K];
  }
  return repositoryRepositoryDependencies[key];
}

export function __setRepositoryRepositoryTestOverrides(
  overrides?: RepositoryRepositoryDependencyOverrides
): void {
  repositoryRepositoryTestOverrides = overrides ?? null;
}

/**
 * Ensures a repository exists and returns its paths
 * @param workdir - Work directory root
 * @param org - Organization name
 * @param repo - Repository name
 * @returns Repository paths
 * @throws {Error} If repository doesn't exist or is invalid
 */
export async function ensureRepository(workdir: string, org: string, repo: string): Promise<RepositoryPaths> {
  const { repoRoot, repositoryPath } = resolveRepositoryPaths(workdir, org, repo);

  let stats;
  try {
    stats = await fs.stat(repositoryPath);
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err && err.code === 'ENOENT') {
      throw new Error(`Repository not found for ${org}/${repo}`);
    }
    throw new Error(`Unable to access repository ${org}/${repo}: ${err.message}`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`Repository path is not a directory: ${repositoryPath}`);
  }

  return { repoRoot, repositoryPath };
}

/**
 * Clones a repository
 * @param workdir - Work directory root
 * @param repositoryUrl - Git repository URL
 * @param options - Options
 * @returns Clone result with org and repo
 * @throws {Error} If clone fails or repository already exists
 */
export async function cloneRepository(
  workdir: string,
  repositoryUrl: string,
  options: CloneOptions = {}
): Promise<CloneResult> {
  const { org, repo, url } = parseRepositoryUrl(repositoryUrl);
  const { repoRoot, repositoryPath } = resolveRepositoryPaths(workdir, org, repo);

  await fs.mkdir(repoRoot, { recursive: true });

  try {
    const stats = await fs.stat(repositoryPath);
    if (stats.isDirectory()) {
      throw new Error(`Repository already exists for ${org}/${repo}`);
    }
    throw new Error(`Cannot create repository at ${repositoryPath}`);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (!err || err.code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    const execGit = resolveRepositoryRepositoryDependency('executeGitCommand');
    await execGit(['clone', url, repositoryPath], {
      maxBuffer: GIT_BUFFER_SIZES.MEDIUM,
    });
  } catch (error: unknown) {
    const message = extractGitErrorMessage(error);
    throw new Error(`Failed to clone repository: ${message}`);
  }

  if (options && Object.prototype.hasOwnProperty.call(options, 'initCommand')) {
    const normalise = resolveRepositoryRepositoryDependency('normaliseInitCommand');
    const initCommand = normalise(options.initCommand);
    try {
      const setInit = resolveRepositoryRepositoryDependency('setRepositoryInitCommand');
      await setInit(repoRoot, initCommand);
    } catch (error: unknown) {
      const err = error as { message?: string };
      throw new Error(`Failed to persist repository settings: ${err?.message || error}`);
    }
  }

  return { org, repo };
}

/**
 * Discovers all repositories in the work directory
 * @param workdir - Work directory root
 * @returns Nested object: {org: {repo: {branches, initCommand}}}
 */
export async function discoverRepositories(workdir: string): Promise<RepositoriesMap> {
  const result: RepositoriesMap = {};
  const listWorktreesFn = resolveRepositoryRepositoryDependency('listWorktrees');
  const getInitCommand = resolveRepositoryRepositoryDependency('getRepositoryInitCommand');

  let organisations;
  try {
    organisations = await fs.readdir(workdir, { withFileTypes: true });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err.code === 'ENOENT') {
      return result;
    }
    throw error;
  }

  for (const orgEntry of organisations) {
    if (!orgEntry.isDirectory()) {
      continue;
    }

    const orgName = orgEntry.name;
    const orgPath = path.join(workdir, orgName);
    let repoEntries;

    try {
      repoEntries = await fs.readdir(orgPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const repoEntry of repoEntries) {
      if (!repoEntry.isDirectory()) {
        continue;
      }

      const repoName = repoEntry.name;
      const repoRoot = path.join(orgPath, repoName);
      const repositoryPath = path.join(repoRoot, 'repository');

      try {
        const stats = await fs.stat(repositoryPath);
        if (!stats.isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }

      const worktrees = await listWorktreesFn(repositoryPath);
      const branches = Array.from(
        new Set(
          worktrees
            .map((entry) => entry.branch)
            .filter((branch): branch is string => typeof branch === 'string' && branch.length > 0)
        )
      );

      let initCommand = '';
      try {
        initCommand = await getInitCommand(repoRoot);
      } catch (error: unknown) {
        const err = error as { message?: string };
        console.warn(
          `[agentrix] Failed to load repository config for ${orgName}/${repoName}:`,
          err?.message || error
        );
        initCommand = '';
      }

      if (!result[orgName]) {
        result[orgName] = {};
      }
      result[orgName]![repoName] = { branches, initCommand };
    }
  }

  return result;
}

export type { RepositoryPaths } from './repository-paths.js';
