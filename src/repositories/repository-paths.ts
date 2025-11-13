import path from 'node:path';
import { RepositoryIdentifierError, validateRepositorySegment } from '../domain/index.js';

export interface RepositoryPaths {
  repoRoot: string;
  repositoryPath: string;
}

function ensureInsideWorkdir(workdir: string, targetPath: string, label: string): string {
  const basePath = path.resolve(workdir);
  const resolvedTarget = path.resolve(targetPath);
  const relative = path.relative(basePath, resolvedTarget);
  const normalizedRelative = relative.replace(/\\/g, '/');

  const outsideWorkdir =
    normalizedRelative === '..' ||
    normalizedRelative.startsWith('../') ||
    path.isAbsolute(relative);

  if (outsideWorkdir) {
    throw new RepositoryIdentifierError(`${label} escapes the configured workdir`);
  }

  return resolvedTarget;
}

export function resolveRepositoryPaths(workdir: string, orgInput: string, repoInput: string): RepositoryPaths {
  const safeOrg = validateRepositorySegment(orgInput, 'organization');
  const safeRepo = validateRepositorySegment(repoInput, 'repository');

  if (typeof workdir !== 'string' || !workdir.trim()) {
    throw new RepositoryIdentifierError('Workdir is required');
  }

  const normalizedWorkdir = path.resolve(workdir);
  const repoRoot = ensureInsideWorkdir(
    normalizedWorkdir,
    path.resolve(normalizedWorkdir, safeOrg, safeRepo),
    'Repository path'
  );
  const repositoryPath = ensureInsideWorkdir(
    normalizedWorkdir,
    path.resolve(repoRoot, 'repository'),
    'Repository path'
  );

  return { repoRoot, repositoryPath };
}
