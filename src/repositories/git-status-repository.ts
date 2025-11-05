import fs from 'node:fs/promises';
import path from 'node:path';
import { executeGitCommandInRepo, GIT_BUFFER_SIZES } from './git-repository.js';
import { getWorktreePath } from './worktree-repository.js';
import { normalizeBranchName } from '../domain/index.js';
import type {
  BranchSummary,
  FileStatusEntry,
  FileStatusCollection,
  GitOperationState,
  CommitCollection,
  WorktreeStatus,
  FileDiff,
  GetWorktreeStatusOptions,
  GetFileDiffOptions,
} from '../types/git.js';

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
const DEFAULT_DIFF_LIMIT = GIT_BUFFER_SIZES.LARGE;

const POSIX_SEPARATOR = '/';

/**
 * Checks if a path exists
 */
async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err && err.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Reads a text file, returning null if it doesn't exist
 */
async function readTextFile(targetPath: string): Promise<string | null> {
  try {
    const data = await fs.readFile(targetPath, 'utf8');
    return data.trim();
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err && err.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * Describes a status symbol
 */
function describeStatusSymbol(symbol: string | undefined): string {
  if (!symbol || symbol === ' ') {
    return 'Updated';
  }
  return STATUS_LABELS.get(symbol) || 'Updated';
}

/**
 * Parses branch summary from git status --porcelain=2 --branch output
 */
function parseBranchSummary(output: string): BranchSummary {
  const summary: BranchSummary = {
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

/**
 * Parses file statuses from git status --porcelain -z output
 */
function parseFileStatuses(raw: string, entryLimit: number = DEFAULT_ENTRY_LIMIT): {
  staged: FileStatusCollection;
  unstaged: FileStatusCollection;
  untracked: FileStatusCollection;
  conflicts: FileStatusCollection;
} {
  const staged: FileStatusEntry[] = [];
  const unstaged: FileStatusEntry[] = [];
  const untracked: FileStatusEntry[] = [];
  const conflicts: FileStatusEntry[] = [];

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
    const originalPath = code[0] === 'R' || code[0] === 'C' ? entries[index + 1] || null : null;
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

  const clamp = (list: FileStatusEntry[]) => ({
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

/**
 * Resolves the remote default HEAD
 */
async function resolveRemoteDefaultHead(worktreePath: string): Promise<string | null> {
  try {
    const { stdout } = await executeGitCommandInRepo(
      worktreePath,
      ['symbolic-ref', 'refs/remotes/origin/HEAD'],
      { maxBuffer: GIT_BUFFER_SIZES.SMALL }
    );
    const value = stdout.trim();
    return value || null;
  } catch {
    return null;
  }
}

/**
 * Checks if a ref exists
 */
async function refExists(worktreePath: string, ref: string | null): Promise<boolean> {
  if (!ref) {
    return false;
  }
  try {
    await executeGitCommandInRepo(
      worktreePath,
      ['rev-parse', '--verify', `${ref}^{commit}`],
      { maxBuffer: GIT_BUFFER_SIZES.SMALL }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves the baseline ref for comparing commits
 */
async function resolveBaselineRef(worktreePath: string, branchSummary: BranchSummary): Promise<string | null> {
  const seen = new Set<string>();
  const candidates: (string | null)[] = [];

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
    // eslint-disable-next-line no-await-in-loop
    if (await refExists(worktreePath, candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Detects in-progress git operations (merge, rebase, cherry-pick, etc.)
 */
async function detectInProgressOperations(gitDir: string): Promise<GitOperationState> {
  if (!gitDir) {
    return {
      merge: { inProgress: false, message: null },
      rebase: { inProgress: false, onto: null, headName: null, type: null, step: null, total: null },
      cherryPick: { inProgress: false, head: null },
      revert: { inProgress: false, head: null },
      bisect: { inProgress: false },
    };
  }

  const state: GitOperationState = {
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
    state.rebase.type = 'merge' as const;
    state.rebase.headName = await readTextFile(path.join(rebaseMergeDir, 'head-name'));
    state.rebase.onto = await readTextFile(path.join(rebaseMergeDir, 'onto'));
    const msg = await readTextFile(path.join(rebaseMergeDir, 'msgnum'));
    const total = await readTextFile(path.join(rebaseMergeDir, 'end'));
    state.rebase.step = msg ? Number.parseInt(msg, 10) || null : null;
    state.rebase.total = total ? Number.parseInt(total, 10) || null : null;
  } else if (await pathExists(rebaseApplyDir)) {
    state.rebase.inProgress = true;
    state.rebase.type = 'apply' as const;
    state.rebase.headName = await readTextFile(path.join(rebaseApplyDir, 'head-name'));
    state.rebase.onto = await readTextFile(path.join(rebaseApplyDir, 'onto'));
    const msg = await readTextFile(path.join(rebaseApplyDir, 'msgnum'));
    const total = await readTextFile(path.join(rebaseApplyDir, 'end'));
    state.rebase.step = msg ? Number.parseInt(msg, 10) || null : null;
    state.rebase.total = total ? Number.parseInt(total, 10) || null : null;
  }

  return state;
}

/**
 * Parses recent commits from git log output
 */
function parseRecentCommits(raw: string, limit: number = DEFAULT_COMMIT_LIMIT): CommitCollection {
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
      hash: hash || '',
      author: author || '',
      relativeTime: relativeTime || '',
      subject: subject || '',
    };
  });

  return {
    items: items.slice(0, limit),
    total: items.length,
    truncated: items.length > limit,
  };
}

/**
 * Gets the status of a worktree
 * @param workdir - Work directory root
 * @param org - Organization name
 * @param repo - Repository name
 * @param branch - Branch name
 * @param options - Options
 * @returns Status object
 */
export async function getWorktreeStatus(
  workdir: string,
  org: string,
  repo: string,
  branch: string,
  { entryLimit = DEFAULT_ENTRY_LIMIT, commitLimit = DEFAULT_COMMIT_LIMIT }: GetWorktreeStatusOptions = {}
): Promise<WorktreeStatus> {
  const branchName = normalizeBranchName(branch);
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
      executeGitCommandInRepo(worktreePath, ['status', '--porcelain=2', '--branch']),
      executeGitCommandInRepo(worktreePath, ['status', '--porcelain', '-z']),
      executeGitCommandInRepo(worktreePath, ['rev-parse', '--git-dir'], {
        maxBuffer: GIT_BUFFER_SIZES.SMALL,
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
  } catch (error: unknown) {
    const err = error as { message?: string };
    const message = err && err.message ? err.message : 'Failed to read git status';
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

  const operations = await detectInProgressOperations(resolvedGitDir || '');

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
      const { stdout } = await executeGitCommandInRepo(worktreePath, logArgs);
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

/**
 * Normalizes a git path (relative to worktree)
 */
function normaliseGitPath(input: string): string {
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

  if (
    !normalised ||
    normalised === '.' ||
    normalised.startsWith('../') ||
    normalised.includes('/../')
  ) {
    throw new Error('Invalid path');
  }

  return normalised;
}

/**
 * Resolves the diff mode from file metadata
 */
function resolveDiffMode({ mode, kind, status }: { mode?: string; kind?: string; status?: string }): 'staged' | 'unstaged' | 'untracked' | 'conflict' {
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

/**
 * Gets the diff for a file in a worktree
 * @param workdir - Work directory root
 * @param org - Organization name
 * @param repo - Repository name
 * @param branch - Branch name
 * @param options - Options
 * @returns Diff object
 */
export async function getWorktreeFileDiff(
  workdir: string,
  org: string,
  repo: string,
  branch: string,
  { path: targetPath, previousPath, mode, status }: GetFileDiffOptions = {}
): Promise<FileDiff> {
  const branchName = normalizeBranchName(branch);
  if (!branchName) {
    throw new Error('branch is required');
  }

  const relativePath = normaliseGitPath(targetPath || '');
  const previousRelativePath = previousPath ? normaliseGitPath(previousPath) : null;

  const { worktreePath } = await getWorktreePath(workdir, org, repo, branchName);
  const diffMode = resolveDiffMode({ mode, kind: mode, status });

  let stdout = '';
  let stderr = '';

  try {
    if (diffMode === 'staged') {
      const { stdout: out } = await executeGitCommandInRepo(worktreePath, [
        'diff',
        '--no-color',
        '--cached',
        '--',
        relativePath,
      ], {
        maxBuffer: DEFAULT_DIFF_LIMIT,
      });
      stdout = out;
    } else if (diffMode === 'untracked') {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      const absolutePath = path.join(worktreePath, relativePath);
      const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
      const { stdout: out } = await execFileAsync('git', [
        'diff',
        '--no-color',
        '--no-index',
        '--',
        nullDevice,
        absolutePath,
      ], { maxBuffer: DEFAULT_DIFF_LIMIT });
      stdout = out;
    } else {
      const { stdout: out } = await executeGitCommandInRepo(worktreePath, [
        'diff',
        '--no-color',
        '--',
        relativePath,
      ], {
        maxBuffer: DEFAULT_DIFF_LIMIT,
      });
      stdout = out;
    }
  } catch (error: unknown) {
    const err = error as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
    stderr = err && err.stderr ? err.stderr.toString() : '';
    stdout = err && err.stdout ? err.stdout.toString() : '';
    if (!stdout.trim()) {
      const message = stderr || err.message || 'Failed to render diff';
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
      } catch (error: unknown) {
        const err = error as { message?: string };
        throw new Error(err.message || 'Failed to read file contents');
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

