/**
 * Helper functions for worktree operations
 */

/**
 * Build worktree key for identification
 */
export function buildWorktreeKey(org: string, repo: string, branch: string): string | null {
  if (!org || !repo || !branch) {
    return null;
  }
  return `${org}/${repo}:${branch}`;
}

/**
 * Parse worktree key into components
 */
export function parseWorktreeKey(key: string): { org: string; repo: string; branch: string } | null {
  if (!key || typeof key !== 'string') {
    return null;
  }
  const match = key.match(/^(.+?)\/(.+?):(.+)$/);
  if (!match) {
    return null;
  }
  return {
    org: match[1],
    repo: match[2],
    branch: match[3],
  };
}

/**
 * Validate branch name
 */
export function isValidBranchName(branchName: string): boolean {
  if (!branchName || typeof branchName !== 'string') {
    return false;
  }
  const trimmed = branchName.trim();
  if (trimmed.length === 0) {
    return false;
  }
  // Basic validation - no spaces, special characters
  return /^[a-zA-Z0-9/_-]+$/.test(trimmed);
}

/**
 * Check if branch is protected (e.g., main, master)
 */
export function isProtectedBranch(branchName: string): boolean {
  if (!branchName || typeof branchName !== 'string') {
    return false;
  }
  const protected_branches = ['main', 'master', 'develop', 'development'];
  return protected_branches.includes(branchName.toLowerCase());
}

