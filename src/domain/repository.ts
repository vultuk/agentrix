/**
 * Repository domain entity
 */

export interface RepositoryData {
  org: string;
  repo: string;
  branches?: string[];
  initCommand?: string;
}

/**
 * Represents a Git repository
 */
export class Repository {
  public readonly org: string;
  public readonly repo: string;
  public readonly branches: string[];
  public readonly initCommand: string;

  constructor({ org, repo, branches = [], initCommand = '' }: RepositoryData) {
    this.org = org;
    this.repo = repo;
    this.branches = branches;
    this.initCommand = initCommand;
  }

  /**
   * Gets the unique identifier for this repository
   * @returns Format: org/repo
   */
  getId(): string {
    return `${this.org}/${this.repo}`;
  }

  /**
   * Gets the repository path within the workdir
   * @param workdir - The work directory root
   * @returns Path to the repository
   */
  getPath(workdir: string): string {
    return `${workdir}/${this.org}/${this.repo}`;
  }

  /**
   * Gets the main repository path (not a worktree)
   * @param workdir - The work directory root
   * @returns Path to the repository directory
   */
  getRepositoryPath(workdir: string): string {
    return `${this.getPath(workdir)}/repository`;
  }

  /**
   * Checks if the repository has any branches
   * @returns True if there are branches
   */
  hasBranches(): boolean {
    return this.branches.length > 0;
  }

  /**
   * Checks if a specific branch exists
   * @param branchName - Branch name to check
   * @returns True if the branch exists
   */
  hasBranch(branchName: string): boolean {
    return this.branches.includes(branchName);
  }

  toJSON(): RepositoryData {
    return {
      org: this.org,
      repo: this.repo,
      branches: this.branches,
      initCommand: this.initCommand,
    };
  }
}

/**
 * Creates a repository instance from raw data
 * @param data - Raw repository data
 * @returns Repository instance
 */
export function createRepository(data: RepositoryData): Repository {
  return new Repository(data);
}
