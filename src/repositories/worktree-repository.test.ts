import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { afterEach, describe, it, mock } from 'node:test';

import {
  __setWorktreeRepositoryTestOverrides,
  GitWorktreeError,
  createWorktree,
  getWorktreePath,
  listWorktrees,
  countLocalWorktrees,
  removeWorktree,
} from './worktree-repository.js';
import { __setGitRepositoryTestOverrides } from './git-repository.js';

describe('worktree-repository', () => {
  afterEach(() => {
    mock.restoreAll();
    __setWorktreeRepositoryTestOverrides();
    __setGitRepositoryTestOverrides();
  });

  describe('listWorktrees', () => {
    it('parses porcelain output into entries', async () => {
      const execMock = mock.fn(async (command: string, args: string[]) => {
        assert.equal(command, 'git');
        assert.deepEqual(args, ['-C', '/repo', 'worktree', 'list', '--porcelain']);
        return {
          stdout:
            'worktree /path/main\nbranch refs/heads/main\n\nworktree /path/feature\nbranch refs/heads/feature/login\n',
          stderr: '',
        };
      });

      __setGitRepositoryTestOverrides({
        execFileAsync: async (command, args, options) => {
          return await execMock(command, args, options);
        },
      });

      const result = await listWorktrees('/repo');
      assert.deepEqual(result, [
        { path: '/path/main', branch: 'main' },
        { path: '/path/feature', branch: 'feature/login' },
      ]);
      assert.equal(execMock.mock.callCount(), 1);
    });

    it('wraps git errors in GitWorktreeError', async () => {
      const execMock = mock.fn(async () => {
        const error = new Error('fatal') as { stderr?: Buffer };
        error.stderr = Buffer.from('fatal: not a git repository');
        throw error;
      });

      __setGitRepositoryTestOverrides({
        execFileAsync: async (command, args, options) => {
          assert.equal(command, 'git');
          return await execMock(command, args, options);
        },
      });

      await assert.rejects(
        listWorktrees('/repo'),
        (error: unknown) => {
          assert.ok(error instanceof GitWorktreeError);
          assert.match(error.message, /fatal: not a git repository/);
          return true;
        }
      );
    });
  });

  describe('countLocalWorktrees', () => {
    it('counts worktrees excluding main by default', async () => {
      const execMock = mock.fn(async () => ({
        stdout:
          'worktree /repo/main\nbranch refs/heads/main\n\nworktree /repo/feature\nbranch refs/heads/feature/login\n',
        stderr: '',
      }));

      __setGitRepositoryTestOverrides({
        execFileAsync: async (command, args, options) => {
          assert.equal(command, 'git');
          return await execMock(command, args, options);
        },
      });

      const count = await countLocalWorktrees('/repo');
      assert.equal(count, 1);
      const includeMain = await countLocalWorktrees('/repo', { includeMain: true });
      assert.equal(includeMain, 2);
    });
  });

  describe('getWorktreePath', () => {
    it('returns repository and worktree paths', async () => {
      const execMock = mock.fn(async () => ({
        stdout: 'worktree /root/feature\nbranch refs/heads/feature/login\n',
        stderr: '',
      }));

      __setGitRepositoryTestOverrides({
        execFileAsync: async (command, args, options) => {
          assert.equal(command, 'git');
          return await execMock(command, args, options);
        },
      });

      const result = await getWorktreePath('/work', 'acme', 'demo', 'feature/login');
      assert.deepEqual(result, {
        repositoryPath: '/work/acme/demo/repository',
        worktreePath: '/root/feature',
      });
    });

    it('throws when branch is not found', async () => {
      __setGitRepositoryTestOverrides({
        execFileAsync: async () => ({ stdout: '', stderr: '' }),
      });

      await assert.rejects(
        getWorktreePath('/work', 'acme', 'demo', 'missing'),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /not found/);
          return true;
        }
      );
    });
  });

  describe('removeWorktree', () => {
    it('throws when removing main worktree', async () => {
      await assert.rejects(
        removeWorktree('/work', 'acme', 'demo', 'main'),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /Cannot remove the main worktree/);
          return true;
        }
      );
    });

    it('removes worktree for existing branch', async () => {
      const worktreeOutput = 'worktree /work/acme/demo/feature-branch\nbranch refs/heads/feature-branch\n';
      const execMock = mock.fn(async (command: string, args: string[]) => {
        assert.equal(command, 'git');
        if (args[2] === 'worktree' && args[3] === 'list') {
          return { stdout: worktreeOutput, stderr: '' };
        }
        if (args[2] === 'worktree' && args[3] === 'remove') {
          assert.deepEqual(args, [
            '-C',
            '/work/acme/demo/repository',
            'worktree',
            'remove',
            '--force',
            '/work/acme/demo/feature-branch',
          ]);
          return { stdout: '', stderr: '' };
        }
        return { stdout: '', stderr: '' };
      });

      __setGitRepositoryTestOverrides({
        execFileAsync: async (command, args, options) => {
          return await execMock(command, args, options);
        },
      });

      await removeWorktree('/work', 'acme', 'demo', 'feature-branch');
      assert.ok(execMock.mock.callCount() >= 2);
    });
  });

  describe('createWorktree', () => {
    it('creates worktree and runs init command', async () => {
      const accessMock = mock.method(fs, 'access', async () => {
        const error = new Error('missing') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      });

      const execMock = mock.fn(async (command: string, args: string[]) => {
        if (args[2] === 'rev-parse') {
          const error = new Error('missing') as { stderr?: Buffer };
          error.stderr = Buffer.from('fatal: ambiguous argument');
          throw error;
        }
        return { stdout: '', stderr: '' };
      });

      __setGitRepositoryTestOverrides({
        execFileAsync: async (command, args, options) => {
          assert.equal(command, 'git');
          return await execMock(command, args, options);
        },
      });

      const initCalls: Array<{ repoRoot: string; worktreePath: string }> = [];
      __setWorktreeRepositoryTestOverrides({
        runRepositoryInitCommand: async (repoRoot: string, worktreePath: string) => {
          initCalls.push({ repoRoot, worktreePath });
          return { ran: true, command: 'echo init' };
        },
      });

      const progressLog: Array<{ step: string; event: string }> = [];
      const progress = {
        ensureStep: (id: string) => progressLog.push({ step: id, event: 'ensure' }),
        startStep: (id: string) => progressLog.push({ step: id, event: 'start' }),
        completeStep: (id: string) => progressLog.push({ step: id, event: 'complete' }),
        skipStep: (id: string) => progressLog.push({ step: id, event: 'skip' }),
        logStep: (id: string, message: string) => progressLog.push({ step: id, event: `log:${message}` }),
      };

      await createWorktree('/work', 'acme', 'demo', 'Feature/Login', {
        progress,
        defaultBranchOverride: 'main',
      });

      assert.equal(accessMock.mock.callCount(), 1);
      const executedArgs = execMock.mock.calls
        .map((call) => call.arguments[1] as string[])
        .filter(Array.isArray);

      assert.ok(executedArgs.some((args) => args.includes('checkout') && args.includes('main')));
      assert.ok(executedArgs.some((args) => args.includes('pull') && args.includes('--ff-only')));
      assert.ok(
        executedArgs.some((args) =>
          args.includes('worktree') &&
          args.includes('add') &&
          args.includes('-b')
        )
      );
      assert.equal(initCalls.length, 1);
      assert.equal(initCalls[0]?.repoRoot, '/work/acme/demo');
      assert.ok(initCalls[0]?.worktreePath.startsWith('/work/acme/demo/'));

      assert.ok(progressLog.some((entry) => entry.step === 'create-worktree' && entry.event === 'complete'));
      assert.ok(progressLog.some((entry) => entry.step === 'run-init-script' && entry.event === 'complete'));
    });

    it('fails when target directory already exists', async () => {
      mock.method(fs, 'access', async () => undefined);

      await assert.rejects(
        createWorktree('/work', 'acme', 'demo', 'existing'),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /already exists/);
          return true;
        }
      );
    });
  });
});

