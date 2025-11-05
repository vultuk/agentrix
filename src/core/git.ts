/**
 * @deprecated This file now re-exports from the repositories layer for backward compatibility.
 * New code should import directly from src/repositories/ or src/domain/
 */

// Re-export from domain layer
export {
  parseRepositoryUrl,
  normalizeBranchName,
  deriveWorktreeFolderName,
} from '../domain/index.js';
export type { GitUrlParts } from '../domain/index.js';

// Re-export from worktree repository
export {
  GitWorktreeError,
  listWorktrees,
  countLocalWorktrees,
  createWorktree,
  getWorktreePath,
  removeWorktree,
} from '../repositories/worktree-repository.js';
export type {
  WorktreeEntry,
  CreateWorktreeOptions,
  WorktreePathResult,
  InitCommandResult,
} from '../repositories/worktree-repository.js';

// Re-export from repository repository
export {
  ensureRepository,
  cloneRepository,
  discoverRepositories,
} from '../repositories/repository-repository.js';
export type {
  RepositoryPaths,
  CloneResult,
  CloneOptions,
  RepositoriesMap,
} from '../repositories/repository-repository.js';

// Re-export from git status repository
export {
  getWorktreeStatus,
  getWorktreeFileDiff,
} from '../repositories/git-status-repository.js';

// Legacy alias for backward compatibility
export { normalizeBranchName as normaliseBranchName } from '../domain/index.js';
