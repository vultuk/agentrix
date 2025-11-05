import type { URL } from 'node:url';
import { ValidationError } from '../infrastructure/errors/index.js';
import { normalizeBranchName } from '../domain/index.js';

/**
 * Normalizes a string value by trimming whitespace
 */
function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// Type helper for required fields (currently unused but kept for future use)
// type RequiredFields<T extends Record<string, unknown>> = {
//   [K in keyof T]: string;
// };

/**
 * Validates that required fields are present and non-empty
 * @param data - The data object to validate
 * @param requiredFields - Array of field names that must be present
 * @returns Object with normalized field values
 * @throws {ValidationError} If any required field is missing or empty
 */
export function validateRequired<T extends string>(
  data: unknown,
  requiredFields: readonly T[]
): Record<T, string> {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Invalid request payload');
  }

  const result: Record<string, string> = {};
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    const value = normalizeString((data as Record<string, unknown>)[field]);
    if (!value) {
      missingFields.push(field);
    }
    result[field] = value;
  }

  if (missingFields.length > 0) {
    const fieldList = missingFields.join(', ');
    throw new ValidationError(`Missing required field(s): ${fieldList}`);
  }

  return result as Record<T, string>;
}

/**
 * Validates and extracts optional fields with default values
 * @param data - The data object to validate
 * @param fieldDefaults - Object mapping field names to default values
 * @returns Object with field values or defaults
 */
export function validateOptional<T extends Record<string, string>>(
  data: unknown,
  fieldDefaults: T
): T {
  if (!data || typeof data !== 'object') {
    return { ...fieldDefaults };
  }

  const result: Record<string, string> = {};
  for (const [field, defaultValue] of Object.entries(fieldDefaults)) {
    const value = normalizeString((data as Record<string, unknown>)[field]);
    result[field] = value || defaultValue;
  }

  return result as T;
}

/**
 * Validates a boolean field
 * @param value - The value to validate
 * @param defaultValue - Default value if validation fails
 * @returns Boolean value
 */
export function validateBoolean(value: unknown, defaultValue: boolean = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return defaultValue;
}

/**
 * Validates a positive integer
 * @param value - The value to validate
 * @param defaultValue - Default value if validation fails
 * @param min - Minimum allowed value (inclusive)
 * @returns Integer value
 */
export function validatePositiveInteger(
  value: unknown,
  defaultValue: number = 1,
  min: number = 1
): number {
  const parsed = Number.parseInt(String(value), 10);
  if (Number.isInteger(parsed) && parsed >= min) {
    return parsed;
  }
  return defaultValue;
}

/**
 * Validates query parameters from URL
 * @param url - The URL object
 * @param requiredParams - Array of required parameter names
 * @returns Object with parameter values
 * @throws {ValidationError} If any required parameter is missing
 */
export function validateQueryParams<T extends string>(
  url: URL,
  requiredParams: readonly T[]
): Record<T, string> {
  if (!url || !url.searchParams) {
    throw new ValidationError('Invalid URL');
  }

  const result: Record<string, string> = {};
  const missingParams: string[] = [];

  for (const param of requiredParams) {
    const value = normalizeString(url.searchParams.get(param));
    if (!value) {
      missingParams.push(param);
    }
    result[param] = value;
  }

  if (missingParams.length > 0) {
    const paramList = missingParams.join(', ');
    throw new ValidationError(`Missing required query parameter(s): ${paramList}`);
  }

  return result as Record<T, string>;
}

/**
 * Validates optional query parameters with defaults
 * @param url - The URL object
 * @param paramDefaults - Object mapping parameter names to default values
 * @returns Object with parameter values or defaults
 */
export function validateOptionalQueryParams<T extends Record<string, string>>(
  url: URL,
  paramDefaults: T
): T {
  if (!url || !url.searchParams) {
    return { ...paramDefaults };
  }

  const result: Record<string, string> = {};
  for (const [param, defaultValue] of Object.entries(paramDefaults)) {
    const value = normalizeString(url.searchParams.get(param));
    result[param] = value || defaultValue;
  }

  return result as T;
}

/**
 * Validates that a string is non-empty
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @throws {ValidationError} If the value is empty
 */
export function requireNonEmpty(value: unknown, fieldName: string = 'Field'): string {
  const normalized = normalizeString(value);
  if (!normalized) {
    throw new ValidationError(`${fieldName} is required and cannot be empty`);
  }
  return normalized;
}

/**
 * Validates repository identifiers (org, repo)
 * @param data - Data object containing org and repo
 * @returns Validated {org, repo}
 * @throws {ValidationError} If org or repo is invalid
 */
export function validateRepositoryIdentifier(data: unknown): { org: string; repo: string } {
  return validateRequired(data, ['org', 'repo'] as const);
}

/**
 * Validates worktree identifiers (org, repo, branch)
 * @param data - Data object containing org, repo, and branch
 * @returns Validated {org, repo, branch}
 * @throws {ValidationError} If any identifier is invalid
 */
export function validateWorktreeIdentifier(data: unknown): { org: string; repo: string; branch: string } {
  return validateRequired(data, ['org', 'repo', 'branch'] as const);
}

/**
 * Extracts and validates repository parameters from URL search params
 * @param searchParams - URL search params
 * @returns Validated {org, repo}
 * @throws {ValidationError} If org or repo is missing
 */
export function extractRepositoryParams(searchParams: URLSearchParams): { org: string; repo: string } {
  const org = normalizeString(searchParams.get('org'));
  const repo = normalizeString(searchParams.get('repo'));
  
  if (!org || !repo) {
    throw new ValidationError('org and repo query parameters are required');
  }
  
  return { org, repo };
}

/**
 * Extracts and validates worktree parameters from URL search params
 * @param searchParams - URL search params
 * @param options - Options for normalization
 * @returns Validated {org, repo, branch}
 * @throws {ValidationError} If any parameter is missing or invalid
 */
export function extractWorktreeParams(
  searchParams: URLSearchParams,
  options: { normalizeBranch?: boolean } = {}
): { org: string; repo: string; branch: string } {
  const org = normalizeString(searchParams.get('org'));
  const repo = normalizeString(searchParams.get('repo'));
  const branchParam = searchParams.get('branch') || '';
  
  const branch = options.normalizeBranch !== false
    ? normalizeBranchName(branchParam)
    : normalizeString(branchParam);
  
  if (!org || !repo || !branch) {
    throw new ValidationError('org, repo, and branch are required');
  }
  
  return { org, repo, branch };
}
