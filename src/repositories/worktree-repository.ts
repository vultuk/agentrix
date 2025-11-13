import fs from 'node:fs/promises';
import path from 'node:path';
import {
  executeGitCommandInRepo,
  extractGitErrorMessage,
  GIT_BUFFER_SIZES,
} from './git-repository.js';
import { normalizeBranchName, deriveWorktreeFolderName } from '../domain/index.js';
import { resolveDefaultBranch } from '../core/default-branch.js';
import {
  getRepositoryInitCommand,
} from '../core/repository-config.js';
import { resolveRepositoryPaths } from './repository-paths.js';

/**
 * Custom error for worktree operations
 */
export class GitWorktreeError extends Error {
  public readonly repositoryPath: string;

  constructor(repositoryPath: string, message: string, cause?: Error | unknown) {
    super(`Failed to list worktrees for ${repositoryPath}: ${message}`);
    this.name = 'GitWorktreeError';
    this.repositoryPath = repositoryPath;
    if (cause) {
      this.cause = cause;
    }
  }
}

export interface WorktreeEntry {
  path: string | null;
  branch: string | null;
}

/**
 * Lists all worktrees for a repository
 * @param repositoryPath - Path to the repository
 * @returns Array of {path, branch} objects
 * @throws {GitWorktreeError}
 */
export async function listWorktrees(repositoryPath: string): Promise<WorktreeEntry[]> {
  try {
    const { stdout } = await executeGitCommandInRepo(
      repositoryPath,
      ['worktree', 'list', '--porcelain'],
      { maxBuffer: GIT_BUFFER_SIZES.MEDIUM }
    );

    if (!stdout.trim()) {
      return [];
    }

    const worktrees: WorktreeEntry[] = [];
    const blocks = stdout.trim().split(/\n\n+/);
    
    blocks.forEach((block) => {
      let worktreePath = null;
      let branchName = null;

      block.split('\n').forEach((line) => {
        if (line.startsWith('worktree ')) {
          worktreePath = line.slice('worktree '.length).trim();
        } else if (line.startsWith('branch ')) {
          const ref = line.slice('branch '.length).trim();
          branchName = ref.replace(/^refs\/heads\//, '');
        }
      });

      worktrees.push({ path: worktreePath, branch: branchName });
    });

    return worktrees;
  } catch (error) {
    const message = extractGitErrorMessage(error);
    console.error(
      `[agentrix] Failed to list worktrees for ${repositoryPath}: ${message}`
    );
    throw new GitWorktreeError(repositoryPath, message, error);
  }
}

/**
 * Counts local worktrees (optionally excluding main)
 * @param repositoryPath - Path to the repository
 * @param options - Options
 * @returns Count of worktrees
 */
export async function countLocalWorktrees(
  repositoryPath: string,
  { includeMain = false }: { includeMain?: boolean } = {}
): Promise<number> {
  const worktrees = await listWorktrees(repositoryPath);
  return worktrees.reduce((total, entry) => {
    if (!entry || typeof entry.branch !== 'string') {
      return total;
    }
    if (!includeMain && entry.branch === 'main') {
      return total;
    }
    return total + 1;
  }, 0);
}

/**
 * Checks if a branch exists in the repository
 * @param repositoryPath - Path to the repository
 * @param branch - Branch name
 * @returns True if branch exists
 */
async function branchExists(repositoryPath: string, branch: string): Promise<boolean> {
  try {
    await executeGitCommandInRepo(
      repositoryPath,
      ['rev-parse', '--verify', `refs/heads/${branch}`],
      { maxBuffer: GIT_BUFFER_SIZES.MEDIUM }
    );
    return true;
  } catch {
    return false;
  }
}

export interface InitCommandResult {
  ran: boolean;
  command: string;
}

/**
 * Runs the repository init command in a worktree
 * @param repoRoot - Repository root directory
 * @param worktreePath - Path to the worktree
 * @returns Init command result
 */
async function internalRunRepositoryInitCommand(repoRoot: string, worktreePath: string): Promise<InitCommandResult> {
  let initCommand = '';
  try {
    initCommand = await getRepositoryInitCommand(repoRoot);
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.warn(
      `[agentrix] Failed to read repository config for ${repoRoot}:`,
      err?.message || error
    );
    initCommand = '';
  }

  if (!initCommand) {
    return { ran: false, command: '' };
  }

  const candidateShell = typeof process.env['SHELL'] === 'string' ? process.env['SHELL'].trim() : '';
  const shell = candidateShell || '/bin/sh';
  const shellName = path.basename(shell);
  const shellArgs = ['-l', '-c', initCommand];

  if (['bash', 'zsh', 'fish'].includes(shellName)) {
    shellArgs.splice(1, 0, '-i');
  }

  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    await execFileAsync(shell, shellArgs, {
      cwd: worktreePath,
      maxBuffer: GIT_BUFFER_SIZES.XLARGE,
      env: { ...process.env },
    });
    return { ran: true, command: initCommand };
  } catch (error: unknown) {
    const err = error as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
    const stderr = err?.stderr ? err.stderr.toString() : '';
    const stdout = err?.stdout ? err.stdout.toString() : '';
    const details = stderr || stdout || err?.message || 'Unknown repository init error';
    throw new Error(`Repository init command failed: ${details.trim()}`);
  }
}

let runRepositoryInitCommandImpl: typeof internalRunRepositoryInitCommand = internalRunRepositoryInitCommand;

async function runRepositoryInitCommand(
  repoRoot: string,
  worktreePath: string
): Promise<InitCommandResult> {
  return await runRepositoryInitCommandImpl(repoRoot, worktreePath);
}

export function __setWorktreeRepositoryTestOverrides(overrides?: {
  runRepositoryInitCommand?: typeof internalRunRepositoryInitCommand;
}): void {
  runRepositoryInitCommandImpl = overrides?.runRepositoryInitCommand ?? internalRunRepositoryInitCommand;
}

export interface CreateWorktreeOptions {
  defaultBranchOverride?: string;
  progress?: unknown;
}

/**
 * Creates a new worktree
 * @param workdir - Work directory root
 * @param org - Organization name
 * @param repo - Repository name
 * @param branch - Branch name
 * @param options - Options
 */
export async function createWorktree(
  workdir: string,
  org: string,
  repo: string,
  branch: string,
  options: CreateWorktreeOptions = {}
): Promise<void> {
  const { defaultBranchOverride, progress } = options || {};
  const branchName = normalizeBranchName(branch);
  
  if (!branchName) {
    throw new Error('Branch name cannot be empty');
  }

  const { repoRoot, repositoryPath } = resolveRepositoryPaths(workdir, org, repo);
  
  const folderName = deriveWorktreeFolderName(branchName);
  if (folderName === '.' || folderName === '..') {
    throw new Error('Invalid worktree folder name derived from branch');
  }
  const targetPath = path.join(repoRoot, folderName);

  try {
    await fs.access(targetPath);
    throw new Error(`Worktree directory already exists at ${targetPath}`);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (!err || err.code !== 'ENOENT') {
      throw error;
    }
  }

  const describeError = (error: unknown, fallback: string = 'Unknown git error'): string => {
    return extractGitErrorMessage(error, fallback);
  };

  const prog = progress as {
    ensureStep?: (id: string, label: string) => void;
    startStep?: (id: string, options: { label: string; message: string }) => void;
    completeStep?: (id: string, options: { label: string; message: string }) => void;
    failStep?: (id: string, options: { label: string; message: string }) => void;
    skipStep?: (id: string, options: { label: string; message: string }) => void;
    logStep?: (id: string, message: string) => void;
  } | undefined;
  
  prog?.ensureStep?.('sync-default-branch', 'Sync default branch');
  prog?.ensureStep?.('create-worktree', 'Create worktree');
  prog?.ensureStep?.('run-init-script', 'Run init script');

  prog?.startStep?.('sync-default-branch', {
    label: 'Sync default branch',
    message: 'Preparing repository and syncing default branch.',
  });

  let defaultBranch = '';
  try {
    defaultBranch = await resolveDefaultBranch(repositoryPath, {
      override: defaultBranchOverride,
    });
    if (defaultBranch) {
      prog?.logStep?.('sync-default-branch', `Resolved default branch: ${defaultBranch}`);
    }
    await executeGitCommandInRepo(repositoryPath, ['checkout', defaultBranch]);
    prog?.logStep?.('sync-default-branch', `Checked out default branch ${defaultBranch}.`);
    
    await executeGitCommandInRepo(repositoryPath, [
      'pull',
      '--ff-only',
      'origin',
      defaultBranch,
    ]);
    
    prog?.completeStep?.('sync-default-branch', {
      label: 'Sync default branch',
      message: `Default branch ${defaultBranch} is up to date.`,
    });
  } catch (error) {
    const message = describeError(error);
    prog?.failStep?.('sync-default-branch', {
      label: 'Sync default branch',
      message,
    });
    throw new Error(`Failed to create worktree: ${message}`);
  }

  prog?.startStep?.('create-worktree', {
    label: 'Create worktree',
    message: `Adding worktree at ${targetPath}`,
  });

  let worktreeAdded = false;
  try {
    const exists = await branchExists(repositoryPath, branchName);
    const args = ['worktree', 'add'];
    if (!exists) {
      args.push('-b', branchName);
    }
    args.push(targetPath);
    if (exists) {
      args.push(branchName);
    }
    await executeGitCommandInRepo(repositoryPath, args);
    worktreeAdded = true;
    prog?.completeStep?.('create-worktree', {
      label: 'Create worktree',
      message: exists
        ? `Attached existing branch ${branchName} to ${targetPath}.`
        : `Created new branch ${branchName} at ${targetPath}.`,
    });
  } catch (error) {
    const message = describeError(error);
    prog?.failStep?.('create-worktree', {
      label: 'Create worktree',
      message,
    });
    throw new Error(`Failed to create worktree: ${message}`);
  }

  prog?.startStep?.('run-init-script', {
    label: 'Run init script',
    message: 'Checking for repository init command.',
  });

  try {
    const initResult = await runRepositoryInitCommand(repoRoot, targetPath);
    if (!initResult?.ran) {
      prog?.skipStep?.('run-init-script', {
        label: 'Run init script',
        message: 'No init command configured for this repository.',
      });
    } else {
      prog?.completeStep?.('run-init-script', {
        label: 'Run init script',
        message: 'Init command completed successfully.',
      });
    }
  } catch (error) {
    const message = describeError(error, 'Repository init command failed');
    prog?.failStep?.('run-init-script', {
      label: 'Run init script',
      message,
    });
    if (worktreeAdded) {
      try {
        await executeGitCommandInRepo(repositoryPath, [
          'worktree',
          'remove',
          '--force',
          targetPath,
        ]);
      } catch (cleanupError: unknown) {
        const cleanupErr = cleanupError as { message?: string };
        console.warn(
          `[agentrix] Failed to clean up worktree at ${targetPath} after init command failure:`,
          cleanupErr?.message || cleanupError
        );
      }
    }
    throw new Error(`Failed to create worktree: ${message}`);
  }
}

export interface WorktreePathResult {
  repositoryPath: string;
  worktreePath: string;
}

/**
 * Gets the path to a worktree for a specific branch
 * @param workdir - Work directory root
 * @param org - Organization name
 * @param repo - Repository name
 * @param branch - Branch name
 * @returns Worktree paths
 */
export async function getWorktreePath(
  workdir: string,
  org: string,
  repo: string,
  branch: string
): Promise<WorktreePathResult> {
  const { repositoryPath } = resolveRepositoryPaths(workdir, org, repo);
  const worktrees = await listWorktrees(repositoryPath);
  const match = worktrees.find((item) => item.branch === branch);
  
  if (!match || !match.path) {
    throw new Error(`Worktree for ${org}/${repo} branch ${branch} not found`);
  }
  
  return { repositoryPath, worktreePath: match.path };
}

/**
 * Removes a worktree
 * @param workdir - Work directory root
 * @param org - Organization name
 * @param repo - Repository name
 * @param branch - Branch name
 */
export async function removeWorktree(
  workdir: string,
  org: string,
  repo: string,
  branch: string
): Promise<void> {
  const branchName = normalizeBranchName(branch);
  
  if (!branchName) {
    throw new Error('Branch name cannot be empty');
  }
  
  if (branchName.toLowerCase() === 'main') {
    throw new Error('Cannot remove the main worktree');
  }

  const { repositoryPath } = resolveRepositoryPaths(workdir, org, repo);
  const worktrees = await listWorktrees(repositoryPath);
  const entry = worktrees.find((item) => item.branch === branchName);

  if (!entry || !entry.path) {
    return;
  }

  try {
    await executeGitCommandInRepo(repositoryPath, [
      'worktree',
      'remove',
      '--force',
      entry.path,
    ]);
  } catch (error) {
    const message = extractGitErrorMessage(error);
    throw new Error(`Failed to remove worktree: ${message}`);
  }
}
