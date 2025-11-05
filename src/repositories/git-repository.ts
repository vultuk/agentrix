import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

const execFileAsync = promisify(execFile);

/**
 * Default buffer sizes for git operations
 */
export const GIT_BUFFER_SIZES = {
  SMALL: 1024 * 64,          // 64 KB - for simple commands
  MEDIUM: 1024 * 1024,       // 1 MB - for most operations
  LARGE: 1024 * 1024 * 4,    // 4 MB - for diffs
  XLARGE: 1024 * 1024 * 16,  // 16 MB - for init commands
} as const;

export interface GitCommandOptions {
  cwd?: string;
  maxBuffer?: number;
  env?: NodeJS.ProcessEnv;
  repositoryPath?: string | null;
}

export interface GitCommandResult {
  stdout: string;
  stderr: string;
}

/**
 * Custom error for git operations
 */
export class GitCommandError extends Error {
  public readonly command: string;
  public readonly args: string[];
  public readonly repositoryPath: string | null;
  public readonly stderr: string;
  public readonly stdout: string;

  constructor(command: string, args: string[], originalError: unknown, repositoryPath: string | null = null) {
    const error = originalError as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
    const stderr = error?.stderr ? error.stderr.toString().trim() : '';
    const stdout = error?.stdout ? error.stdout.toString().trim() : '';
    const message = stderr || stdout || error?.message || 'Unknown git error';
    
    super(message);
    this.name = 'GitCommandError';
    this.command = command;
    this.args = args;
    this.repositoryPath = repositoryPath;
    this.stderr = stderr;
    this.stdout = stdout;
    
    if (originalError instanceof Error) {
      this.cause = originalError;
    }
    
    Error.captureStackTrace(this, this.constructor);
  }

  override toString(): string {
    return `GitCommandError: ${this.message} (git ${this.args?.join(' ') || ''})`;
  }
}

/**
 * Executes a git command with standard error handling
 * @param args - Git command arguments (without 'git' itself)
 * @param options - Execution options
 * @returns Command result with stdout and stderr
 * @throws {GitCommandError}
 */
export async function executeGitCommand(
  args: string[],
  options: GitCommandOptions = {}
): Promise<GitCommandResult> {
  const {
    cwd,
    maxBuffer = GIT_BUFFER_SIZES.MEDIUM,
    env = process.env,
    repositoryPath = null,
  } = options;

  try {
    const result = await execFileAsync('git', args, {
      cwd,
      maxBuffer,
      env: { ...env },
    });
    return result;
  } catch (error: unknown) {
    throw new GitCommandError('git', args, error, repositoryPath);
  }
}

/**
 * Executes a git command in a specific repository directory
 * @param repositoryPath - Path to the repository
 * @param commandArgs - Git command arguments (after -C flag)
 * @param options - Additional options
 * @returns Command result
 */
export async function executeGitCommandInRepo(
  repositoryPath: string,
  commandArgs: string[],
  options: Omit<GitCommandOptions, 'repositoryPath'> = {}
): Promise<GitCommandResult> {
  const args = ['-C', repositoryPath, ...commandArgs];
  return executeGitCommand(args, {
    ...options,
    repositoryPath,
  });
}

/**
 * Extracts error message from a git error
 * @param error - The error object
 * @param fallback - Fallback message if extraction fails
 * @returns Error message
 */
export function extractGitErrorMessage(error: unknown, fallback: string = 'Unknown git error'): string {
  if (error instanceof GitCommandError) {
    return error.message;
  }
  
  const err = error as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
  const stderr = err?.stderr ? err.stderr.toString().trim() : '';
  const stdout = err?.stdout ? err.stdout.toString().trim() : '';
  return (stderr || stdout || err?.message || fallback).trim();
}

/**
 * Checks if a git error indicates a "not found" condition
 * @param error - The error to check
 * @returns True if error indicates not found
 */
export function isNotFoundError(error: unknown): boolean {
  const message = extractGitErrorMessage(error, '');
  return /not found|does not exist|no such/i.test(message);
}

/**
 * Checks if a git error indicates a conflict
 * @param error - The error to check
 * @returns True if error indicates conflict
 */
export function isConflictError(error: unknown): boolean {
  const message = extractGitErrorMessage(error, '');
  return /conflict|already exists/i.test(message);
}
