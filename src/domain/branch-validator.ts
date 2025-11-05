/**
 * Branch name validation and normalization
 */

/**
 * Normalizes a branch name by trimming whitespace
 * @param branch - Branch name to normalize
 * @returns Normalized branch name
 */
export function normalizeBranchName(branch: unknown): string {
  if (typeof branch !== 'string') {
    return '';
  }
  return branch.trim();
}

/**
 * Sanitizes a branch name (alias for normalizeBranchName for clarity)
 * @param branch - Branch name to sanitize
 * @returns Sanitized branch name
 */
export function sanitizeBranchName(branch: unknown): string {
  return normalizeBranchName(branch);
}

/**
 * Derives a worktree folder name from a branch name
 * Takes the last segment after splitting by '/'
 * @param branch - Branch name
 * @returns Folder name for the worktree
 * @throws {Error} If branch name is invalid or empty
 */
export function deriveWorktreeFolderName(branch: string): string {
  const trimmed = normalizeBranchName(branch);
  if (!trimmed) {
    throw new Error('Branch name cannot be empty');
  }
  const parts = trimmed.split('/').filter(Boolean);
  const folder = parts[parts.length - 1];
  if (!folder) {
    throw new Error('Unable to derive worktree folder from branch name');
  }
  return folder;
}

/**
 * Validates that a branch name is not empty
 * @param branch - Branch name to validate
 * @returns Validated branch name
 * @throws {Error} If branch name is invalid
 */
export function validateBranchName(branch: string): string {
  const normalized = normalizeBranchName(branch);
  if (!normalized) {
    throw new Error('Branch name cannot be empty');
  }
  return normalized;
}

/**
 * Value object representing a branch name
 */
export class BranchName {
  public readonly value: string;

  constructor(name: string) {
    this.value = validateBranchName(name);
  }

  toString(): string {
    return this.value;
  }

  /**
   * Gets the worktree folder name for this branch
   * @returns Folder name
   */
  toFolderName(): string {
    return deriveWorktreeFolderName(this.value);
  }

  /**
   * Checks if this is the main/default branch
   * @param defaultBranch - The default branch name (default: 'main')
   * @returns True if this is the default branch
   */
  isDefault(defaultBranch: string = 'main'): boolean {
    return this.value.toLowerCase() === defaultBranch.toLowerCase();
  }

  equals(other: BranchName | string): boolean {
    if (other instanceof BranchName) {
      return this.value === other.value;
    }
    return this.value === other;
  }
}
