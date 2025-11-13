/**
 * Git URL parsing utilities
 */

import { validateRepositorySegment } from './repository-identifiers.js';

export interface GitUrlParts {
  org: string;
  repo: string;
  url: string;
}

/**
 * Parses a Git repository URL into org and repo components
 * @param input - Repository URL (SSH, HTTPS, or path format)
 * @returns Object with {org, repo, url} properties
 * @throws {Error} If URL cannot be parsed
 */
export function parseRepositoryUrl(input: string): GitUrlParts {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('Repository URL is required');
  }

  const trimmed = input.trim();
  let org = '';
  let repo = '';

  // Try SSH format: git@github.com:org/repo.git
  const sshMatch = trimmed.match(/^git@[^:]+:([^/]+)\/(.+)$/);
  if (sshMatch) {
    org = sshMatch[1]!;
    repo = sshMatch[2]!;
  } else {
    // Try HTTPS/HTTP URL format
    try {
      if (/^[a-z]+:\/\//i.test(trimmed)) {
        const url = new URL(trimmed);
        const parts = url.pathname.replace(/^\//, '').split('/').filter(Boolean);
        if (parts.length >= 2) {
          org = parts[parts.length - 2]!;
          repo = parts[parts.length - 1]!;
        }
      }
    } catch {
      // ignore URL parsing errors and fall back to manual parsing
    }

    // If not parsed yet, try path-like format
    if (!org || !repo) {
      const cleaned = trimmed.replace(/\.git$/, '');
      const segments = cleaned.split(/[\\/]+/).filter(Boolean);
      if (segments.length >= 2) {
        org = segments[segments.length - 2]!;
        repo = segments[segments.length - 1]!;
      }
    }

    // Try colon-separated format (alternate SSH style)
    if ((!org || !repo) && trimmed.includes(':')) {
      const tail = trimmed.split(':').pop() || '';
      const segments = tail.replace(/\.git$/, '').split('/').filter(Boolean);
      if (segments.length >= 2) {
        org = segments[segments.length - 2]!;
        repo = segments[segments.length - 1]!;
      }
    }
  }

  // Remove .git extension from repo name
  repo = repo ? repo.replace(/\.git$/, '') : repo;

  if (!org || !repo) {
    throw new Error('Unable to determine repository organisation and name from URL');
  }

  const validatedOrg = validateRepositorySegment(org, 'organization');
  const validatedRepo = validateRepositorySegment(repo, 'repository');

  return { org: validatedOrg, repo: validatedRepo, url: trimmed };
}

/**
 * Value object representing a parsed Git URL
 */
export class GitUrl {
  public readonly org: string;
  public readonly repo: string;
  public readonly url: string;

  constructor(url: string) {
    const parsed = parseRepositoryUrl(url);
    this.org = parsed.org;
    this.repo = parsed.repo;
    this.url = parsed.url;
  }

  toString(): string {
    return this.url;
  }

  toIdentifier(): string {
    return `${this.org}/${this.repo}`;
  }
}
