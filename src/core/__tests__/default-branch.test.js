import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { resolveDefaultBranch, selectDefaultBranchOverride } from '../default-branch.js';

const execFileAsync = promisify(execFile);

async function runGit(args, options) {
  await execFileAsync('git', args, { ...options, maxBuffer: 1024 * 1024 });
}

async function createRepositoryFixture(defaultBranch = 'main') {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), `tw-default-branch-${defaultBranch}-`));
  const seedPath = path.join(baseDir, 'seed');
  const remotePath = path.join(baseDir, 'remote.git');
  const clonePath = path.join(baseDir, 'clone');

  await fs.mkdir(seedPath, { recursive: true });
  await runGit(['init', '-b', defaultBranch], { cwd: seedPath });
  await runGit(['config', 'user.name', 'Test User'], { cwd: seedPath });
  await runGit(['config', 'user.email', 'test@example.com'], { cwd: seedPath });
  await fs.writeFile(path.join(seedPath, 'README.md'), '# default branch fixture\n');
  await runGit(['add', 'README.md'], { cwd: seedPath });
  await runGit(['commit', '-m', 'Initial commit'], { cwd: seedPath });

  await runGit(['init', '--bare', remotePath], {});
  await runGit(['remote', 'add', 'origin', remotePath], { cwd: seedPath });
  await runGit(['push', '-u', 'origin', defaultBranch], { cwd: seedPath });
  await runGit(['symbolic-ref', 'HEAD', `refs/heads/${defaultBranch}`], { cwd: remotePath });

  await runGit(['clone', remotePath, clonePath], {});

  return {
    repositoryPath: clonePath,
    remotePath,
    async cleanup() {
      await fs.rm(baseDir, { recursive: true, force: true });
    },
  };
}

test('resolveDefaultBranch returns branch from symbolic-ref', async () => {
  const fixture = await createRepositoryFixture('develop');
  try {
    const branch = await resolveDefaultBranch(fixture.repositoryPath);
    assert.equal(branch, 'develop');
  } finally {
    await fixture.cleanup();
  }
});

test('resolveDefaultBranch falls back to remote HEAD when HEAD is detached', async () => {
  const fixture = await createRepositoryFixture('release');
  try {
    await runGit(['checkout', '--detach'], { cwd: fixture.repositoryPath });
    const branch = await resolveDefaultBranch(fixture.repositoryPath);
    assert.equal(branch, 'release');
  } finally {
    await fixture.cleanup();
  }
});

test('resolveDefaultBranch returns override when provided', async () => {
  const fixture = await createRepositoryFixture('main');
  try {
    const branch = await resolveDefaultBranch(fixture.repositoryPath, { override: 'custom' });
    assert.equal(branch, 'custom');
  } finally {
    await fixture.cleanup();
  }
});

test('selectDefaultBranchOverride resolves repo-specific override first', () => {
  const override = selectDefaultBranchOverride(
    {
      global: 'main',
      overrides: {
        'acme/repo': 'develop',
      },
    },
    'acme',
    'repo',
  );
  assert.equal(override, 'develop');
});

test('selectDefaultBranchOverride falls back to global override', () => {
  const override = selectDefaultBranchOverride(
    {
      global: 'production',
    },
    'acme',
    'unknown',
  );
  assert.equal(override, 'production');
});

