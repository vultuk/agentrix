/**
 * Validation helpers for repository identifiers.
 */

const PATH_SEPARATOR_PATTERN = /[\\/]/;
const TRAVERSAL_TOKENS = new Set(['.', '..']);

function formatLabel(label: string): string {
  if (!label) {
    return 'Repository segment';
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Error thrown when a repository identifier is invalid.
 */
export class RepositoryIdentifierError extends Error {
  public readonly statusCode: number = 400;

  constructor(message: string) {
    super(message);
    this.name = 'RepositoryIdentifierError';
  }
}

/**
 * Normalizes and validates a repository identifier segment (org or repo).
 * @param value - Raw segment value
 * @param label - Label used in error messages
 * @returns Normalized segment
 * @throws {RepositoryIdentifierError} When the segment contains traversal tokens or separators
 */
export function validateRepositorySegment(value: unknown, label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  const targetLabel = formatLabel(label);

  if (!normalized) {
    throw new RepositoryIdentifierError(`${targetLabel} is required`);
  }

  if (TRAVERSAL_TOKENS.has(normalized)) {
    throw new RepositoryIdentifierError(`${targetLabel} cannot be a traversal segment`);
  }

  if (PATH_SEPARATOR_PATTERN.test(normalized)) {
    throw new RepositoryIdentifierError(`${targetLabel} cannot contain path separators`);
  }

  return normalized;
}
