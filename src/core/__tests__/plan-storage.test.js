import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { savePlanToWorktree } from '../plan-storage.js';

test('savePlanToWorktree writes plan file with formatted timestamp and normalised branch name', async () => {
  const worktree = await mkdtemp(join(tmpdir(), 'plan-storage-'));
  try {
    const clock = () => new Date('2025-10-29T12:34:56.000Z');
    const gitAddCalls = [];
    const gitAdd = async (cwd) => {
      gitAddCalls.push(cwd);
    };
    const result = await savePlanToWorktree({
      worktreePath: worktree,
      branch: 'feat/new-feature',
      planText: 'Line 1\nLine 2',
      clock,
      gitAdd,
    });

    const plansDir = join(worktree, '.plans');
    const expectedName = '20251029_123456-feat_new-feature.md';
    const expectedPath = join(plansDir, expectedName);

    assert.equal(result, expectedPath);

    const entries = await readdir(plansDir);
    assert.deepEqual(entries, [expectedName]);

    const content = await readFile(expectedPath, 'utf8');
    assert.equal(content, 'Line 1\nLine 2\n');
    assert.deepEqual(gitAddCalls, [worktree]);
  } finally {
    await rm(worktree, { recursive: true, force: true });
  }
});

test('savePlanToWorktree skips blank prompts without writing files', async () => {
  const worktree = await mkdtemp(join(tmpdir(), 'plan-storage-'));
  try {
    const gitAddCalls = [];
    const gitAdd = async (cwd) => {
      gitAddCalls.push(cwd);
    };
    const result = await savePlanToWorktree({
      worktreePath: worktree,
      branch: 'main',
      planText: '   ',
      gitAdd,
    });

    assert.equal(result, null);

    const plansDir = join(worktree, '.plans');
    await assert.rejects(() => stat(plansDir), (error) => error && error.code === 'ENOENT');
    assert.deepEqual(gitAddCalls, []);
  } finally {
    await rm(worktree, { recursive: true, force: true });
  }
});

test('savePlanToWorktree reuses existing file when contents match latest plan', async () => {
  const worktree = await mkdtemp(join(tmpdir(), 'plan-storage-'));
  try {
    const firstClock = () => new Date('2025-10-29T12:34:56.000Z');
    const secondClock = () => new Date('2025-10-29T12:35:00.000Z');
    const planText = 'Identical plan text';
    const gitAddCalls = [];
    const gitAdd = async (cwd) => {
      gitAddCalls.push(cwd);
    };

    const firstPath = await savePlanToWorktree({
      worktreePath: worktree,
      branch: 'feat/duplicate',
      planText,
      clock: firstClock,
      gitAdd,
    });

    const secondPath = await savePlanToWorktree({
      worktreePath: worktree,
      branch: 'feat/duplicate',
      planText,
      clock: secondClock,
      gitAdd,
    });

    assert.equal(secondPath, firstPath);

    const plansDir = join(worktree, '.plans');
    const entries = await readdir(plansDir);
    assert.deepEqual(entries, ['20251029_123456-feat_duplicate.md']);

    const content = await readFile(firstPath, 'utf8');
    assert.equal(content, 'Identical plan text\n');
    assert.deepEqual(gitAddCalls, [worktree]);
  } finally {
    await rm(worktree, { recursive: true, force: true });
  }
});
