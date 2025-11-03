import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

import { resolveDefaultBranch } from './default-branch.js';
import {
  getRepositoryInitCommand,
  normaliseInitCommand,
  setRepositoryInitCommand,
} from './repository-config.js';

const execFileAsync = promisify(execFile);
const INIT_COMMAND_MAX_BUFFER = 1024 * 1024 * 16;

export class GitWorktreeError extends Error {
  constructor(repositoryPath, message, cause) {
    super(`Failed to list worktrees for ${repositoryPath}: ${message}`);
    this.name = 'GitWorktreeError';
    this.repositoryPath = repositoryPath;
    if (cause) {
      this.cause = cause;
    }
  }
}

export async function listWorktrees(repositoryPath) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', repositoryPath, 'worktree', 'list', '--porcelain'],
      { maxBuffer: 1024 * 1024 },
    );

    if (!stdout.trim()) {
      return [];
    }

    const worktrees = [];
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
    const stderr = error && error.stderr ? error.stderr.toString().trim() : '';
    const message = stderr || error.message || 'Unknown git error';
    console.error(
      `[terminal-worktree] Failed to list worktrees for ${repositoryPath}: ${message}`,
    );
    throw new GitWorktreeError(repositoryPath, message, error);
  }
}

export async function countLocalWorktrees(
  repositoryPath,
  { includeMain = false } = {},
) {
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

export function parseRepositoryUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('Repository URL is required');
  }

  const trimmed = input.trim();
  let org = '';
  let repo = '';

  const sshMatch = trimmed.match(/^git@[^:]+:([^/]+)\/(.+)$/);
  if (sshMatch) {
    org = sshMatch[1];
    repo = sshMatch[2];
  } else {
    try {
      if (/^[a-z]+:\/\//i.test(trimmed)) {
        const url = new URL(trimmed);
        const parts = url.pathname.replace(/^\//, '').split('/').filter(Boolean);
        if (parts.length >= 2) {
          org = parts[parts.length - 2];
          repo = parts[parts.length - 1];
        }
      }
    } catch {
      // ignore URL parsing errors and fall back to manual parsing
    }

    if (!org || !repo) {
      const cleaned = trimmed.replace(/\.git$/, '');
      const segments = cleaned.split(/[\\/]+/).filter(Boolean);
      if (segments.length >= 2) {
        org = segments[segments.length - 2];
        repo = segments[segments.length - 1];
      }
    }

    if ((!org || !repo) && trimmed.includes(':')) {
      const tail = trimmed.split(':').pop() || '';
      const segments = tail.replace(/\.git$/, '').split('/').filter(Boolean);
      if (segments.length >= 2) {
        org = segments[segments.length - 2];
        repo = segments[segments.length - 1];
      }
    }
  }

  repo = repo ? repo.replace(/\.git$/, '') : repo;

  if (!org || !repo) {
    throw new Error('Unable to determine repository organisation and name from URL');
  }

  return { org, repo, url: trimmed };
}

export function normaliseBranchName(branch) {
  if (typeof branch !== 'string') {
    return '';
  }
  return branch.trim();
}

export function deriveWorktreeFolderName(branch) {
  const trimmed = normaliseBranchName(branch);
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

export async function ensureRepository(workdir, org, repo) {
  if (!org || !repo) {
    throw new Error('Repository identifier is incomplete');
  }

  const repoRoot = path.join(workdir, org, repo);
  const repositoryPath = path.join(repoRoot, 'repository');

  let stats;
  try {
    stats = await fs.stat(repositoryPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`Repository not found for ${org}/${repo}`);
    }
    throw new Error(`Unable to access repository ${org}/${repo}: ${error.message}`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`Repository path is not a directory: ${repositoryPath}`);
  }

  return { repoRoot, repositoryPath };
}

export async function cloneRepository(workdir, repositoryUrl, options = {}) {
  const { org, repo, url } = parseRepositoryUrl(repositoryUrl);
  const repoRoot = path.join(workdir, org, repo);
  const repositoryPath = path.join(repoRoot, 'repository');

  await fs.mkdir(repoRoot, { recursive: true });

  try {
    const stats = await fs.stat(repositoryPath);
    if (stats.isDirectory()) {
      throw new Error(`Repository already exists for ${org}/${repo}`);
    }
    throw new Error(`Cannot create repository at ${repositoryPath}`);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  try {
    await execFileAsync('git', ['clone', url, repositoryPath], { maxBuffer: 1024 * 1024 });
  } catch (error) {
    const stderr = error && error.stderr ? error.stderr.toString() : '';
    const message = stderr || error.message || 'Unknown git error';
    throw new Error(`Failed to clone repository: ${message.trim()}`);
  }

  if (options && Object.prototype.hasOwnProperty.call(options, 'initCommand')) {
    const initCommand = normaliseInitCommand(options.initCommand);
    try {
      await setRepositoryInitCommand(repoRoot, initCommand);
    } catch (error) {
      throw new Error(`Failed to persist repository settings: ${error?.message || error}`);
    }
  }

  return { org, repo };
}

async function branchExists(repositoryPath, branch) {
  try {
    await execFileAsync(
      'git',
      ['-C', repositoryPath, 'rev-parse', '--verify', `refs/heads/${branch}`],
      { maxBuffer: 1024 * 1024 },
    );
    return true;
  } catch {
    return false;
  }
}

async function runRepositoryInitCommand(repoRoot, worktreePath) {
  let initCommand = '';
  try {
    initCommand = await getRepositoryInitCommand(repoRoot);
  } catch (error) {
    console.warn(
      `[terminal-worktree] Failed to read repository config for ${repoRoot}:`,
      error?.message || error,
    );
    initCommand = '';
  }

  if (!initCommand) {
    return { ran: false, command: '' };
  }

  const candidateShell = typeof process.env.SHELL === 'string' ? process.env.SHELL.trim() : '';
  const shell = candidateShell || '/bin/sh';
  const shellName = path.basename(shell);
  const shellArgs = ['-l', '-c', initCommand];

  if (['bash', 'zsh', 'fish'].includes(shellName)) {
    shellArgs.splice(1, 0, '-i');
  }

  try {
    await execFileAsync(shell, shellArgs, {
      cwd: worktreePath,
      maxBuffer: INIT_COMMAND_MAX_BUFFER,
      env: { ...process.env },
    });
    return { ran: true, command: initCommand };
  } catch (error) {
    const stderr = error?.stderr ? error.stderr.toString() : '';
    const stdout = error?.stdout ? error.stdout.toString() : '';
    const details = stderr || stdout || error?.message || 'Unknown repository init error';
    throw new Error(`Repository init command failed: ${details.trim()}`);
  }
}

export async function createWorktree(workdir, org, repo, branch, options = {}) {
  const { defaultBranchOverride, progress } = options || {};
  const branchName = normaliseBranchName(branch);
  if (!branchName) {
    throw new Error('Branch name cannot be empty');
  }

  const { repoRoot, repositoryPath } = await ensureRepository(workdir, org, repo);
  const folderName = deriveWorktreeFolderName(branchName);
  const targetPath = path.join(repoRoot, folderName);

  try {
    await fs.access(targetPath);
    throw new Error(`Worktree directory already exists at ${targetPath}`);
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  const describeError = (error, fallback = 'Unknown git error') => {
    const stderr = error && error.stderr ? error.stderr.toString() : '';
    const stdout = error && error.stdout ? error.stdout.toString() : '';
    return (stderr || stdout || error?.message || fallback).trim();
  };

  progress?.ensureStep('sync-default-branch', 'Sync default branch');
  progress?.ensureStep('create-worktree', 'Create worktree');
  progress?.ensureStep('run-init-script', 'Run init script');

  progress?.startStep('sync-default-branch', {
    label: 'Sync default branch',
    message: 'Preparing repository and syncing default branch.',
  });

  let defaultBranch = '';
  try {
    defaultBranch = await resolveDefaultBranch(repositoryPath, {
      override: defaultBranchOverride,
    });
    if (defaultBranch) {
      progress?.logStep('sync-default-branch', `Resolved default branch: ${defaultBranch}`);
    }
    await execFileAsync('git', ['-C', repositoryPath, 'checkout', defaultBranch], {
      maxBuffer: 1024 * 1024,
    });
    progress?.logStep(
      'sync-default-branch',
      `Checked out default branch ${defaultBranch}.`,
    );
    await execFileAsync('git', ['-C', repositoryPath, 'pull', '--ff-only', 'origin', defaultBranch], {
      maxBuffer: 1024 * 1024,
    });
    progress?.completeStep('sync-default-branch', {
      label: 'Sync default branch',
      message: `Default branch ${defaultBranch} is up to date.`,
    });
  } catch (error) {
    const message = describeError(error);
    progress?.failStep('sync-default-branch', {
      label: 'Sync default branch',
      message,
    });
    throw new Error(`Failed to create worktree: ${message}`);
  }

  progress?.startStep('create-worktree', {
    label: 'Create worktree',
    message: `Adding worktree at ${targetPath}`,
  });

  let worktreeAdded = false;
  try {
    const exists = await branchExists(repositoryPath, branchName);
    const args = ['-C', repositoryPath, 'worktree', 'add'];
    if (!exists) {
      args.push('-b', branchName);
    }
    args.push(targetPath);
    if (exists) {
      args.push(branchName);
    }
    await execFileAsync('git', args, { maxBuffer: 1024 * 1024 });
    worktreeAdded = true;
    progress?.completeStep('create-worktree', {
      label: 'Create worktree',
      message: exists
        ? `Attached existing branch ${branchName} to ${targetPath}.`
        : `Created new branch ${branchName} at ${targetPath}.`,
    });
  } catch (error) {
    const message = describeError(error);
    progress?.failStep('create-worktree', {
      label: 'Create worktree',
      message,
    });
    throw new Error(`Failed to create worktree: ${message}`);
  }

  progress?.startStep('run-init-script', {
    label: 'Run init script',
    message: 'Checking for repository init command.',
  });

  try {
    const initResult = await runRepositoryInitCommand(repoRoot, targetPath);
    if (!initResult?.ran) {
      progress?.skipStep('run-init-script', {
        label: 'Run init script',
        message: 'No init command configured for this repository.',
      });
    } else {
      progress?.completeStep('run-init-script', {
        label: 'Run init script',
        message: 'Init command completed successfully.',
      });
    }
  } catch (error) {
    const message = describeError(error, 'Repository init command failed');
    progress?.failStep('run-init-script', {
      label: 'Run init script',
      message,
    });
    if (worktreeAdded) {
      try {
        await execFileAsync(
          'git',
          ['-C', repositoryPath, 'worktree', 'remove', '--force', targetPath],
          { maxBuffer: 1024 * 1024 },
        );
      } catch (cleanupError) {
        console.warn(
          `[terminal-worktree] Failed to clean up worktree at ${targetPath} after init command failure:`,
          cleanupError?.message || cleanupError,
        );
      }
    }
    throw new Error(`Failed to create worktree: ${message}`);
  }
}

export async function getWorktreePath(workdir, org, repo, branch) {
  const { repositoryPath } = await ensureRepository(workdir, org, repo);
  const worktrees = await listWorktrees(repositoryPath);
  const match = worktrees.find((item) => item.branch === branch);
  if (!match || !match.path) {
    throw new Error(`Worktree for ${org}/${repo} branch ${branch} not found`);
  }
  return { repositoryPath, worktreePath: match.path };
}

export async function discoverRepositories(workdir) {
  const result = {};

  let organisations;
  try {
    organisations = await fs.readdir(workdir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return result;
    }
    throw error;
  }

  for (const orgEntry of organisations) {
    if (!orgEntry.isDirectory()) {
      continue;
    }

    const orgName = orgEntry.name;
    const orgPath = path.join(workdir, orgName);
    let repoEntries;

    try {
      repoEntries = await fs.readdir(orgPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const repoEntry of repoEntries) {
      if (!repoEntry.isDirectory()) {
        continue;
      }

      const repoName = repoEntry.name;
      const repoRoot = path.join(orgPath, repoName);
      const repositoryPath = path.join(repoRoot, 'repository');

      try {
        const stats = await fs.stat(repositoryPath);
        if (!stats.isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      const worktrees = await listWorktrees(repositoryPath);
      const branches = Array.from(
        new Set(
          worktrees
            .map((entry) => entry.branch)
            .filter((branch) => typeof branch === 'string' && branch.length > 0),
        ),
      );
      let initCommand = '';
      try {
        initCommand = await getRepositoryInitCommand(repoRoot);
      } catch (error) {
        console.warn(
          `[terminal-worktree] Failed to load repository config for ${orgName}/${repoName}:`,
          error?.message || error,
        );
        initCommand = '';
      }
      if (!result[orgName]) {
        result[orgName] = {};
      }
      result[orgName][repoName] = { branches, initCommand };
    }
  }

  return result;
}

export async function removeWorktree(workdir, org, repo, branch) {
  const branchName = normaliseBranchName(branch);
  if (!branchName) {
    throw new Error('Branch name cannot be empty');
  }
  if (branchName.toLowerCase() === 'main') {
    throw new Error('Cannot remove the main worktree');
  }

  const { repositoryPath } = await ensureRepository(workdir, org, repo);
  const worktrees = await listWorktrees(repositoryPath);
  const entry = worktrees.find((item) => item.branch === branchName);

  if (!entry || !entry.path) {
    return;
  }

  try {
    await execFileAsync(
      'git',
      ['-C', repositoryPath, 'worktree', 'remove', '--force', entry.path],
      { maxBuffer: 1024 * 1024 },
    );
  } catch (error) {
    const stderr = error && error.stderr ? error.stderr.toString() : '';
    const message = stderr || error.message || 'Unknown git error';
    throw new Error(`Failed to remove worktree: ${message.trim()}`);
  }
}

const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

const STATUS_LABELS = new Map([
  ['M', 'Modified'],
  ['A', 'Added'],
  ['D', 'Deleted'],
  ['R', 'Renamed'],
  ['C', 'Copied'],
  ['T', 'Type Changed'],
  ['U', 'Unmerged'],
  ['?', 'Untracked'],
]);

const DEFAULT_ENTRY_LIMIT = 200;
const DEFAULT_COMMIT_LIMIT = 10;
const DEFAULT_DIFF_LIMIT = 1024 * 1024 * 4; // 4 MiB

const POSIX_SEPARATOR = '/';

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function readTextFile(targetPath) {
  try {
    const data = await fs.readFile(targetPath, 'utf8');
    return data.trim();
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function describeStatusSymbol(symbol) {
  if (!symbol || symbol === ' ') {
    return 'Updated';
  }
  return STATUS_LABELS.get(symbol) || 'Updated';
}

function parseBranchSummary(output) {
  const summary = {
    oid: null,
    head: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    detached: false,
    unborn: false,
    mergeTarget: null,
  };

  if (!output) {
    return summary;
  }

  output
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      if (!line.startsWith('# ')) {
        return;
      }

      const body = line.slice(2);

      if (body.startsWith('branch.oid ')) {
        summary.oid = body.slice('branch.oid '.length).trim() || null;
        return;
      }

      if (body.startsWith('branch.head ')) {
        const head = body.slice('branch.head '.length).trim();
        summary.head = head === '(detached)' ? null : head;
        summary.detached = head === '(detached)';
        summary.unborn = head === '(unborn)';
        return;
      }

      if (body.startsWith('branch.upstream ')) {
        summary.upstream = body.slice('branch.upstream '.length).trim() || null;
        return;
      }

      if (body.startsWith('branch.ab ')) {
        const parts = body.slice('branch.ab '.length).trim().split(/\s+/);
        const aheadPart = parts.find((item) => item.startsWith('+'));
        const behindPart = parts.find((item) => item.startsWith('-'));
        if (aheadPart) {
          const value = Number.parseInt(aheadPart.slice(1), 10);
          summary.ahead = Number.isFinite(value) ? value : 0;
        }
        if (behindPart) {
          const value = Number.parseInt(behindPart.slice(1), 10);
          summary.behind = Number.isFinite(value) ? value : 0;
        }
        return;
      }

      if (body.startsWith('branch.merge ')) {
        summary.mergeTarget = body.slice('branch.merge '.length).trim() || null;
      }
    });

  return summary;
}

function parseFileStatuses(raw, entryLimit = DEFAULT_ENTRY_LIMIT) {
  const staged = [];
  const unstaged = [];
  const untracked = [];
  const conflicts = [];

  if (!raw) {
    return {
      staged: { items: [], total: 0, truncated: false },
      unstaged: { items: [], total: 0, truncated: false },
      untracked: { items: [], total: 0, truncated: false },
      conflicts: { items: [], total: 0, truncated: false },
    };
  }

  const entries = raw.split('\0');
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry) {
      continue;
    }

    const code = entry.slice(0, 2);
    if (code === '??') {
      const filePath = entry.slice(3);
      if (filePath) {
        untracked.push({
          path: filePath,
          status: code,
          kind: 'untracked',
          description: 'Untracked',
        });
      }
      continue;
    }

    if (code === '!!') {
      // Ignored files are omitted from the summary.
      continue;
    }

    const filePath = entry.slice(3);
    const originalPath = (code[0] === 'R' || code[0] === 'C') ? entries[index + 1] || null : null;
    if (originalPath && (code[0] === 'R' || code[0] === 'C')) {
      index += 1;
    }

    const baseRecord = {
      path: filePath,
      previousPath: originalPath,
      status: code,
      indexStatus: code[0],
      worktreeStatus: code[1],
    };

    if (CONFLICT_CODES.has(code)) {
      conflicts.push({
        ...baseRecord,
        kind: 'conflict',
        description: 'Conflict',
      });
      continue;
    }

    if (baseRecord.indexStatus && baseRecord.indexStatus !== ' ') {
      staged.push({
        ...baseRecord,
        kind: 'staged',
        description: describeStatusSymbol(baseRecord.indexStatus),
      });
    }

    if (baseRecord.worktreeStatus && baseRecord.worktreeStatus !== ' ') {
      unstaged.push({
        ...baseRecord,
        kind: 'unstaged',
        description: describeStatusSymbol(baseRecord.worktreeStatus),
      });
    }
  }

  const clamp = (list) => ({
    items: list.slice(0, entryLimit),
    total: list.length,
    truncated: list.length > entryLimit,
  });

  return {
    staged: clamp(staged),
    unstaged: clamp(unstaged),
    untracked: clamp(untracked),
    conflicts: clamp(conflicts),
  };
}

async function resolveRemoteDefaultHead(worktreePath) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', worktreePath, 'symbolic-ref', 'refs/remotes/origin/HEAD'],
      { maxBuffer: 1024 * 64 },
    );
    const value = stdout.trim();
    return value || null;
  } catch {
    return null;
  }
}

async function refExists(worktreePath, ref) {
  if (!ref) {
    return false;
  }
  try {
    await execFileAsync(
      'git',
      ['-C', worktreePath, 'rev-parse', '--verify', `${ref}^{commit}`],
      { maxBuffer: 1024 * 64 },
    );
    return true;
  } catch {
    return false;
  }
}

async function resolveBaselineRef(worktreePath, branchSummary) {
  const seen = new Set();
  const candidates = [];

  if (branchSummary.mergeTarget) {
    candidates.push(branchSummary.mergeTarget);
  }

  const remoteHead = await resolveRemoteDefaultHead(worktreePath);
  if (remoteHead) {
    candidates.push(remoteHead);
  }

  candidates.push('origin/main', 'origin/master', 'main', 'master');

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) {
      continue;
    }
    seen.add(candidate);
    if (branchSummary.head && candidate.replace(/^refs\/heads\//, '') === branchSummary.head) {
      continue;
    }
    if (await refExists(worktreePath, candidate)) {
      return candidate;
    }
  }

  return null;
}

async function detectInProgressOperations(gitDir) {
  if (!gitDir) {
    return {
      merge: { inProgress: false, message: null },
      rebase: { inProgress: false, onto: null, headName: null, type: null, step: null, total: null },
      cherryPick: { inProgress: false, head: null },
      revert: { inProgress: false, head: null },
      bisect: { inProgress: false },
    };
  }

  const state = {
    merge: { inProgress: false, message: null },
    rebase: { inProgress: false, onto: null, headName: null, type: null, step: null, total: null },
    cherryPick: { inProgress: false, head: null },
    revert: { inProgress: false, head: null },
    bisect: { inProgress: false },
  };

  const mergeHeadPath = path.join(gitDir, 'MERGE_HEAD');
  if (await pathExists(mergeHeadPath)) {
    state.merge.inProgress = true;
    state.merge.message = await readTextFile(path.join(gitDir, 'MERGE_MSG'));
  }

  const cherryPickHead = path.join(gitDir, 'CHERRY_PICK_HEAD');
  if (await pathExists(cherryPickHead)) {
    state.cherryPick.inProgress = true;
    state.cherryPick.head = await readTextFile(cherryPickHead);
  }

  const revertHead = path.join(gitDir, 'REVERT_HEAD');
  if (await pathExists(revertHead)) {
    state.revert.inProgress = true;
    state.revert.head = await readTextFile(revertHead);
  }

  const bisectLog = path.join(gitDir, 'BISECT_LOG');
  if (await pathExists(bisectLog)) {
    state.bisect.inProgress = true;
  }

  const rebaseMergeDir = path.join(gitDir, 'rebase-merge');
  const rebaseApplyDir = path.join(gitDir, 'rebase-apply');

  if (await pathExists(rebaseMergeDir)) {
    state.rebase.inProgress = true;
    state.rebase.type = 'merge';
    state.rebase.headName = await readTextFile(path.join(rebaseMergeDir, 'head-name'));
    state.rebase.onto = await readTextFile(path.join(rebaseMergeDir, 'onto'));
    const msg = await readTextFile(path.join(rebaseMergeDir, 'msgnum'));
    const total = await readTextFile(path.join(rebaseMergeDir, 'end'));
    state.rebase.step = msg ? Number.parseInt(msg, 10) || null : null;
    state.rebase.total = total ? Number.parseInt(total, 10) || null : null;
  } else if (await pathExists(rebaseApplyDir)) {
    state.rebase.inProgress = true;
    state.rebase.type = 'apply';
    state.rebase.headName = await readTextFile(path.join(rebaseApplyDir, 'head-name'));
    state.rebase.onto = await readTextFile(path.join(rebaseApplyDir, 'onto'));
    const msg = await readTextFile(path.join(rebaseApplyDir, 'msgnum'));
    const total = await readTextFile(path.join(rebaseApplyDir, 'end'));
    state.rebase.step = msg ? Number.parseInt(msg, 10) || null : null;
    state.rebase.total = total ? Number.parseInt(total, 10) || null : null;
  }

  return state;
}

function parseRecentCommits(raw, limit = DEFAULT_COMMIT_LIMIT) {
  if (!raw) {
    return { items: [], total: 0, truncated: false };
  }

  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const items = lines.map((line) => {
    const [hash, author, relativeTime, subject] = line.split('\x1f');
    return {
      hash,
      author,
      relativeTime,
      subject,
    };
  });

  return {
    items: items.slice(0, limit),
    total: items.length,
    truncated: items.length > limit,
  };
}

export async function getWorktreeStatus(
  workdir,
  org,
  repo,
  branch,
  { entryLimit = DEFAULT_ENTRY_LIMIT, commitLimit = DEFAULT_COMMIT_LIMIT } = {},
) {
  const branchName = normaliseBranchName(branch);
  if (!branchName) {
    throw new Error('branch is required');
  }

  const { repositoryPath, worktreePath } = await getWorktreePath(workdir, org, repo, branchName);

  let branchOutput;
  let statusOutput;
  let gitDirOutput;
  let commitsOutput = '';

  try {
    const results = await Promise.allSettled([
      execFileAsync('git', ['-C', worktreePath, 'status', '--porcelain=2', '--branch'], {
        maxBuffer: 1024 * 1024,
      }),
      execFileAsync('git', ['-C', worktreePath, 'status', '--porcelain', '-z'], {
        maxBuffer: 1024 * 1024,
      }),
      execFileAsync('git', ['-C', worktreePath, 'rev-parse', '--git-dir'], {
        maxBuffer: 1024 * 64,
      }),
    ]);

    const [branchResult, statusResult, gitDirResult] = results;

    if (branchResult.status === 'fulfilled') {
      branchOutput = branchResult.value.stdout;
    } else {
      throw branchResult.reason;
    }

    if (statusResult.status === 'fulfilled') {
      statusOutput = statusResult.value.stdout;
    } else {
      throw statusResult.reason;
    }

    if (gitDirResult.status === 'fulfilled') {
      gitDirOutput = gitDirResult.value.stdout.trim();
    } else {
      gitDirOutput = null;
    }
  } catch (error) {
    const message = error && error.message ? error.message : 'Failed to read git status';
    throw new Error(message);
  }

  const branchSummary = parseBranchSummary(branchOutput);
  const fileStatuses = parseFileStatuses(statusOutput, entryLimit);

  let resolvedGitDir = null;
  if (gitDirOutput) {
    resolvedGitDir = path.isAbsolute(gitDirOutput)
      ? gitDirOutput
      : path.resolve(worktreePath, gitDirOutput);
  }

  const operations = await detectInProgressOperations(resolvedGitDir);

  if (commitLimit > 0) {
    const fetchLimit = Math.max(commitLimit * 2, commitLimit);
    const includeRefs = ['HEAD'];
    const excludeRefs = [];

    if (branchSummary.upstream) {
      excludeRefs.push(branchSummary.upstream);
    } else if (
      branchSummary.head &&
      branchSummary.head.toLowerCase() !== 'main' &&
      !branchSummary.detached
    ) {
      const baseline = await resolveBaselineRef(worktreePath, branchSummary);
      if (baseline) {
        excludeRefs.push(baseline);
      }
    }

    const logArgs = [
      '-C',
      worktreePath,
      'log',
      '--pretty=format:%H%x1f%an%x1f%ar%x1f%s',
      '--max-count',
      String(fetchLimit),
      ...includeRefs,
    ];

    excludeRefs.forEach((ref) => {
      logArgs.push('--not', ref);
    });

    try {
      const { stdout } = await execFileAsync('git', logArgs, { maxBuffer: 1024 * 1024 });
      commitsOutput = stdout;
    } catch {
      commitsOutput = '';
    }
  }

  const recentCommits = parseRecentCommits(commitsOutput, commitLimit);

  return {
    fetchedAt: new Date().toISOString(),
    org,
    repo,
    branch: branchName,
    repositoryPath,
    worktreePath,
    branchSummary,
    files: fileStatuses,
    operations,
    commits: recentCommits,
    totals: {
      staged: fileStatuses.staged.total,
      unstaged: fileStatuses.unstaged.total,
      untracked: fileStatuses.untracked.total,
      conflicts: fileStatuses.conflicts.total,
    },
  };
}

function normaliseGitPath(input) {
  if (typeof input !== 'string') {
    throw new Error('path is required');
  }

  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('path is required');
  }

  if (path.isAbsolute(trimmed)) {
    throw new Error('path must be relative to the worktree');
  }

  const sanitised = trimmed.split(/\\+/).join(POSIX_SEPARATOR);
  const normalised = path.posix.normalize(sanitised);

  if (!normalised || normalised === '.' || normalised.startsWith('../') || normalised.includes('/../')) {
    throw new Error('Invalid path');
  }

  return normalised;
}

function resolveDiffMode({ mode, kind, status }) {
  if (mode === 'staged') {
    return 'staged';
  }
  if (mode === 'untracked' || kind === 'untracked') {
    return 'untracked';
  }
  if (mode === 'conflict' || kind === 'conflict') {
    return 'conflict';
  }
  if (mode === 'staged' || kind === 'staged' || (status && status[0] && status[0] !== ' ')) {
    return 'staged';
  }
  return 'unstaged';
}

export async function getWorktreeFileDiff(
  workdir,
  org,
  repo,
  branch,
  {
    path: targetPath,
    previousPath,
    mode,
    status,
  } = {},
) {
  const branchName = normaliseBranchName(branch);
  if (!branchName) {
    throw new Error('branch is required');
  }

  const relativePath = normaliseGitPath(targetPath || '');
  const previousRelativePath = previousPath ? normaliseGitPath(previousPath) : null;

  const { worktreePath } = await getWorktreePath(workdir, org, repo, branchName);
  const diffMode = resolveDiffMode({ mode, kind: mode, status });

  const baseArgs = ['-C', worktreePath, 'diff', '--no-color'];
  let args;

  if (diffMode === 'staged') {
    args = [...baseArgs, '--cached', '--', relativePath];
  } else if (diffMode === 'untracked') {
    const absolutePath = path.join(worktreePath, relativePath);
    const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
    args = ['diff', '--no-color', '--no-index', '--', nullDevice, absolutePath];
  } else {
    args = [...baseArgs, '--', relativePath];
  }

  let stdout = '';
  let stderr = '';

  try {
    if (diffMode === 'untracked') {
      const { stdout: out } = await execFileAsync('git', args, { maxBuffer: DEFAULT_DIFF_LIMIT });
      stdout = out;
    } else {
      const { stdout: out } = await execFileAsync('git', args, { maxBuffer: DEFAULT_DIFF_LIMIT });
      stdout = out;
    }
  } catch (error) {
    stderr = error && error.stderr ? error.stderr.toString() : '';
    stdout = error && error.stdout ? error.stdout.toString() : '';
    if (!stdout.trim()) {
      const message = stderr || error.message || 'Failed to render diff';
      throw new Error(message.trim());
    }
  }

  if (diffMode === 'untracked' && stdout.trim()) {
    stdout = stdout
      .replace(/^---\s+.*$/m, '--- /dev/null')
      .replace(/^\+\+\+\s+.*$/m, `+++ b/${relativePath}`);
  }

  if (!stdout.trim()) {
    if (diffMode === 'untracked') {
      try {
        const absolutePath = path.join(worktreePath, relativePath);
        const data = await fs.readFile(absolutePath, 'utf8');
        const lines = data.split('\n');
        const diffLines = lines.map((line) => `+${line}`).join('\n');
        const totalLines = lines.length;
        return {
          path: relativePath,
          previousPath: previousRelativePath,
          mode: diffMode,
          diff: `--- /dev/null\n+++ b/${relativePath}\n@@ -0,0 +1,${Math.max(totalLines, 1)}\n${diffLines}`,
        };
      } catch (error) {
        throw new Error(error.message || 'Failed to read file contents');
      }
    }

    return {
      path: relativePath,
      previousPath: previousRelativePath,
      mode: diffMode,
      diff: 'No differences to display.',
    };
  }

  return {
    path: relativePath,
    previousPath: previousRelativePath,
    mode: diffMode,
    diff: stdout,
  };
}
