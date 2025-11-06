import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  listPlansForWorktree,
  readPlanFromWorktree,
  savePlanToWorktree,
  _internals,
} from './plan-storage.js';

async function createTempWorktree(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'agentrix-plan-storage-'));
}

describe('plan-storage', () => {
  let worktreeRoot: string;

  beforeEach(async () => {
    worktreeRoot = await createTempWorktree();
  });

  afterEach(async () => {
    if (worktreeRoot) {
      await rm(worktreeRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  describe('_internals helpers', () => {
    it('formats timestamps and rejects invalid dates', () => {
      const date = new Date('2024-05-06T07:08:09Z');
      assert.equal(_internals.formatTimestampPart(date), '20240506_070809');

      assert.throws(() => _internals.formatTimestampPart(new Date('invalid')));
    });

    it('normalises branch names and enforces presence', () => {
      assert.equal(_internals.normaliseBranchName(' Feature/ABC-123 '), 'Feature_ABC-123');
      assert.throws(() => _internals.normaliseBranchName('   '), /Branch name is required/);
    });

    it('ensures trailing newline and parses plan filenames', () => {
      assert.equal(_internals.ensureTrailingNewline('hello'), 'hello\n');
      assert.equal(_internals.ensureTrailingNewline('hello\n'), 'hello\n');

      const parsed = _internals.parsePlanFilename('20240506_070809-main.md');
      assert.ok(parsed);
      assert.equal(parsed?.branchSuffix, 'main');
      assert.ok(parsed?.createdAt instanceof Date);

      assert.equal(_internals.parsePlanFilename('invalid-name.md'), null);
      assert.equal(_internals.parsePlanFilename(123 as never), null);
    });
  });

  describe('savePlanToWorktree', () => {
    it('creates plan files, appends newline, and triggers git add', async () => {
      const gitAdd = mock.fn(async () => {});
      const clock = () => new Date('2024-05-06T07:08:09Z');

      const planPath = await savePlanToWorktree({
        worktreePath: worktreeRoot,
        branch: 'feature/new',
        planText: 'Do something important',
        gitAdd,
        clock,
      });

      assert.ok(planPath);
      const content = await readFile(planPath!, 'utf8');
      assert.equal(content, 'Do something important\n');
      assert.equal(gitAdd.mock.calls.length, 1);
      assert.equal(gitAdd.mock.calls[0]?.arguments[0], worktreeRoot);

      const expectedName = join(worktreeRoot, '.plans', '20240506_070809-feature_new.md');
      assert.equal(planPath, expectedName);
    });

    it('returns existing plan path when latest content matches', async () => {
      const plansDir = join(worktreeRoot, '.plans');
      await mkdir(plansDir, { recursive: true });
      const existingPath = join(plansDir, '20240506_070809-main.md');
      await writeFile(existingPath, 'Keep existing\n', 'utf8');

      const result = await savePlanToWorktree({
        worktreePath: worktreeRoot,
        branch: 'main',
        planText: 'Keep existing',
        gitAdd: async () => {
          throw new Error('should not run');
        },
      });

      assert.equal(result, existingPath);
    });

    it('skips empty plan text and enforces branch sanitisation', async () => {
      const gitAdd = mock.fn(async () => {});
      const result = await savePlanToWorktree({
        worktreePath: worktreeRoot,
        branch: 'main',
        planText: '   ',
        gitAdd,
      });

      assert.equal(result, null);
      assert.equal(gitAdd.mock.calls.length, 0);

      await assert.rejects(
        () =>
          savePlanToWorktree({
            worktreePath: worktreeRoot,
            branch: '   ',
            planText: 'content',
          }),
        /Branch name is required/,
      );
    });

    it('prunes older plans when exceeding per-branch limit', async () => {
      const plansDir = join(worktreeRoot, '.plans');
      await mkdir(plansDir, { recursive: true });
      const names = [
        '20240101_000000-feature_new.md',
        '20240201_000000-feature_new.md',
        '20240301_000000-feature_new.md',
      ];
      for (const name of names) {
        await writeFile(join(plansDir, name), `content ${name}\n`, 'utf8');
      }

      await savePlanToWorktree({
        worktreePath: worktreeRoot,
        branch: 'feature/new',
        planText: 'latest plan',
        gitAdd: async () => {},
        clock: () => new Date('2024-04-01T00:00:00Z'),
        maxPlansPerBranch: 2,
      });

      const entries = await readdir(plansDir);
      assert.equal(entries.length, 2);
      assert.deepEqual(entries.sort(), [
        '20240301_000000-feature_new.md',
        '20240401_000000-feature_new.md',
      ]);
    });
  });

  describe('listPlansForWorktree', () => {
    it('lists plans in reverse chronological order and applies limit', async () => {
      const plansDir = join(worktreeRoot, '.plans');
      await mkdir(plansDir, { recursive: true });
      await writeFile(join(plansDir, '20240101_010203-main.md'), 'one\n', 'utf8');
      await writeFile(join(plansDir, '20240202_020304-main.md'), 'two\n', 'utf8');

      const plans = await listPlansForWorktree({
        worktreePath: worktreeRoot,
        branch: 'main',
      });
      assert.equal(plans.length, 2);
      assert.deepEqual(plans.map((plan) => plan.id), [
        '20240202_020304-main.md',
        '20240101_010203-main.md',
      ]);

      const limited = await listPlansForWorktree({
        worktreePath: worktreeRoot,
        branch: 'main',
        limit: 1,
      });
      assert.equal(limited.length, 1);
      assert.equal(limited[0]?.id, '20240202_020304-main.md');
    });

    it('returns empty list when directory is missing', async () => {
      const plans = await listPlansForWorktree({
        worktreePath: worktreeRoot,
        branch: 'main',
      });
      assert.deepEqual(plans, []);
    });
  });

  describe('readPlanFromWorktree', () => {
    it('reads plan content and validates identifier', async () => {
      const plansDir = join(worktreeRoot, '.plans');
      await mkdir(plansDir, { recursive: true });
      const fileName = '20240101_010203-main.md';
      await writeFile(join(plansDir, fileName), 'contents\n', 'utf8');

      const plan = await readPlanFromWorktree({
        worktreePath: worktreeRoot,
        branch: 'main',
        id: fileName,
      });

      assert.equal(plan.id, fileName);
      assert.equal(plan.branch, 'main');
      assert.equal(plan.content, 'contents\n');

      await assert.rejects(
        () =>
          readPlanFromWorktree({
            worktreePath: worktreeRoot,
            branch: 'main',
            id: '../evil',
          }),
        /Invalid plan identifier/,
      );

      await assert.rejects(
        () =>
          readPlanFromWorktree({
            worktreePath: worktreeRoot,
            branch: 'main',
            id: '20240101_010203-feature.md',
          }),
        /Plan not found/,
      );
    });
  });
});


