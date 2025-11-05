/**
 * Worktree domain entity
 */

export interface WorktreeData {
  path: string;
  branch: string;
  org: string;
  repo: string;
}

/**
 * Represents a Git worktree
 */
export class Worktree {
  public readonly path: string;
  public readonly branch: string;
  public readonly org: string;
  public readonly repo: string;

  constructor({ path, branch, org, repo }: WorktreeData) {
    this.path = path;
    this.branch = branch;
    this.org = org;
    this.repo = repo;
  }

  /**
   * Gets the unique key for this worktree
   * @returns Format: org::repo::branch
   */
  getKey(): string {
    return `${this.org}::${this.repo}::${this.branch}`;
  }

  /**
   * Gets the repository identifier
   * @returns Format: org/repo
   */
  getRepositoryId(): string {
    return `${this.org}/${this.repo}`;
  }

  /**
   * Checks if this is the main worktree
   * @param defaultBranch - The default branch name
   * @returns True if this is the main worktree
   */
  isMainWorktree(defaultBranch: string = 'main'): boolean {
    return typeof this.branch === 'string' && this.branch.toLowerCase() === defaultBranch.toLowerCase();
  }

  toJSON(): WorktreeData {
    return {
      path: this.path,
      branch: this.branch,
      org: this.org,
      repo: this.repo,
    };
  }
}

/**
 * Creates a worktree instance from raw data
 * @param data - Raw worktree data
 * @returns Worktree instance
 */
export function createWorktree(data: WorktreeData): Worktree {
  return new Worktree(data);
}
