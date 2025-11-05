import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

import { ensureRepository, listWorktrees } from './git.js';
import { disposeSessionsForRepository } from './terminal-sessions.js';
import { tmuxKillSessionsForRepository } from './tmux.js';

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 1024 * 1024;

function normalise(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function removeRepository(workdir: string, orgInput: string, repoInput: string): Promise<void> {
  const org = normalise(orgInput);
  const repo = normalise(repoInput);

  if (!org || !repo) {
    throw new Error('org and repo are required');
  }

  const { repoRoot, repositoryPath } = await ensureRepository(workdir, org, repo);
  const worktrees = await listWorktrees(repositoryPath);
  const branches = Array.from(
    new Set(
      worktrees
        .map((entry) => entry.branch)
        .filter((branch): branch is string => typeof branch === 'string' && branch.length > 0)
    )
  );

  await disposeSessionsForRepository(org, repo);
  await tmuxKillSessionsForRepository(org, repo, branches);

  const repositoryRealPath = path.resolve(repositoryPath);
  for (const entry of worktrees) {
    if (!entry?.path) {
      continue;
    }
    const targetPath = path.resolve(entry.path);
    if (targetPath === repositoryRealPath) {
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      await execFileAsync(
        'git',
        ['-C', repositoryPath, 'worktree', 'remove', '--force', targetPath],
        { maxBuffer: GIT_MAX_BUFFER }
      );
    } catch (error: unknown) {
      const err = error as { stderr?: Buffer | string; message?: string };
      const stderr = err && err.stderr ? err.stderr.toString() : '';
      const message = stderr || err.message || 'Unknown git error';
      throw new Error(`Failed to remove worktree ${targetPath}: ${message.trim()}`);
    }
  }

  await fs.rm(repoRoot, { recursive: true, force: true });

  const orgPath = path.dirname(repoRoot);
  try {
    const remaining = await fs.readdir(orgPath);
    if (remaining.length === 0) {
      await fs.rmdir(orgPath);
    }
  } catch {
    // ignore cleanup errors
  }
}
