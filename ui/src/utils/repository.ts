/**
 * Repository utility functions
 */

/**
 * Parse command value with fallback
 */
export function parseCommand(value: any, fallback: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return fallback;
}

/**
 * Generate cache key for repository
 */
export function getRepositoryCacheKey(org: string, repo: string): string {
  return `${org}::${repo}`;
}

/**
 * Generate key for worktree
 */
export function getWorktreeKey(org: string, repo: string, branch: string): string {
  return `${org}::${repo}::${branch}`;
}

/**
 * Parse worktree key into components
 */
export function parseWorktreeKey(key: string): { org: string; repo: string; branch: string } | null {
  const parts = key.split('::');
  if (parts.length !== 3) {
    return null;
  }
  return {
    org: parts[0],
    repo: parts[1],
    branch: parts[2],
  };
}

/**
 * Check if session exists for worktree
 */
export function hasSessionForWorktree(
  sessionMap: Map<string, string>,
  knownSessions: Set<string>,
  org: string,
  repo: string,
  branch: string
): boolean {
  const key = getWorktreeKey(org, repo, branch);
  return sessionMap.has(key) || knownSessions.has(key);
}

