/**
 * Git and repository type definitions
 */

/**
 * Worktree information
 */
export interface WorktreeInfo {
  path: string | null;
  branch: string | null;
}

/**
 * Repository paths
 */
export interface RepositoryPaths {
  repoRoot: string;
  repositoryPath: string;
}

/**
 * Worktree paths
 */
export interface WorktreePaths {
  repositoryPath: string;
  worktreePath: string;
}

/**
 * Branch summary from git status
 */
export interface BranchSummary {
  oid: string | null;
  head: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  detached: boolean;
  unborn: boolean;
  mergeTarget: string | null;
}

/**
 * File status entry
 */
export interface FileStatusEntry {
  path: string;
  previousPath?: string | null;
  status: string;
  indexStatus?: string;
  worktreeStatus?: string;
  kind: 'staged' | 'unstaged' | 'untracked' | 'conflict';
  description: string;
}

/**
 * File status collection
 */
export interface FileStatusCollection {
  items: FileStatusEntry[];
  total: number;
  truncated: boolean;
}

/**
 * Git operation state
 */
export interface GitOperationState {
  merge: {
    inProgress: boolean;
    message: string | null;
  };
  rebase: {
    inProgress: boolean;
    onto: string | null;
    headName: string | null;
    type: string | null;
    step: number | null;
    total: number | null;
  };
  cherryPick: {
    inProgress: boolean;
    head: string | null;
  };
  revert: {
    inProgress: boolean;
    head: string | null;
  };
  bisect: {
    inProgress: boolean;
  };
}

/**
 * Commit entry
 */
export interface CommitEntry {
  hash: string;
  author: string;
  relativeTime: string;
  subject: string;
}

/**
 * Commit collection
 */
export interface CommitCollection {
  items: CommitEntry[];
  total: number;
  truncated: boolean;
}

/**
 * Worktree status result
 */
export interface WorktreeStatus {
  fetchedAt: string;
  org: string;
  repo: string;
  branch: string;
  repositoryPath: string;
  worktreePath: string;
  branchSummary: BranchSummary;
  files: {
    staged: FileStatusCollection;
    unstaged: FileStatusCollection;
    untracked: FileStatusCollection;
    conflicts: FileStatusCollection;
  };
  operations: GitOperationState;
  commits: CommitCollection;
  totals: {
    staged: number;
    unstaged: number;
    untracked: number;
    conflicts: number;
  };
}

/**
 * File diff result
 */
export interface FileDiff {
  path: string;
  previousPath: string | null;
  mode: 'staged' | 'unstaged' | 'untracked' | 'conflict';
  diff: string;
}

/**
 * Progress reporter interface
 */
export interface ProgressReporter {
  ensureStep(id: string, label: string): void;
  startStep(id: string, options: { label: string; message: string }): void;
  completeStep(id: string, options: { label: string; message: string }): void;
  failStep(id: string, options: { label: string; message: string }): void;
  skipStep(id: string, options: { label: string; message: string }): void;
  logStep(id: string, message: string): void;
}

/**
 * Clone repository options
 */
export interface CloneRepositoryOptions {
  initCommand?: string;
}

/**
 * Create worktree options
 */
export interface CreateWorktreeOptions {
  defaultBranchOverride?: string;
  progress?: ProgressReporter;
}

/**
 * Get worktree status options
 */
export interface GetWorktreeStatusOptions {
  entryLimit?: number;
  commitLimit?: number;
}

/**
 * Get file diff options
 */
export interface GetFileDiffOptions {
  path?: string;
  previousPath?: string;
  mode?: string;
  status?: string;
}

