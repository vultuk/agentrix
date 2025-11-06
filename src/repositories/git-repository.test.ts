import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  __setGitRepositoryTestOverrides,
  executeGitCommand,
  executeGitCommandInRepo,
  extractGitErrorMessage,
  GitCommandError,
  isConflictError,
  isNotFoundError,
} from './git-repository.js';

describe('git-repository', () => {
  afterEach(() => {
    __setGitRepositoryTestOverrides();
  });

  it('executes git commands with provided options', async () => {
    const calls: Array<{
      command: string;
      args: string[];
      options: { cwd?: string; maxBuffer?: number; env?: Record<string, unknown> };
    }> = [];

    __setGitRepositoryTestOverrides({
      execFileAsync: async (command, args, options) => {
        calls.push({
          command,
          args,
          options: options as {
            cwd?: string;
            maxBuffer?: number;
            env?: Record<string, unknown>;
          },
        });
        return { stdout: 'ok', stderr: '' };
      },
    });

    const result = await executeGitCommand(['status'], {
      cwd: '/tmp/repo',
      maxBuffer: 1024,
      env: { TEST_ENV: '1' },
    });

    assert.equal(result.stdout, 'ok');
    assert.equal(result.stderr, '');
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.ok(call);
    assert.equal(call.command, 'git');
    assert.deepEqual(call.args, ['status']);
    assert.deepEqual(call.options, {
      cwd: '/tmp/repo',
      maxBuffer: 1024,
      env: { TEST_ENV: '1' },
    });
  });

  it('wraps errors in GitCommandError with metadata', async () => {
    const error = Object.assign(new Error('boom'), {
      stderr: Buffer.from('fatal: repository not found'),
      stdout: Buffer.from(''),
    });

    __setGitRepositoryTestOverrides({
      execFileAsync: async () => {
        throw error;
      },
    });

    await assert.rejects(
      executeGitCommand(['pull'], { repositoryPath: '/tmp/repo' }),
      (err: unknown) => {
        assert.ok(err instanceof GitCommandError);
        const gitError = err as GitCommandError;
        assert.equal(gitError.command, 'git');
        assert.deepEqual(gitError.args, ['pull']);
        assert.equal(gitError.repositoryPath, '/tmp/repo');
        assert.equal(gitError.stderr, 'fatal: repository not found');
        assert.equal(gitError.stdout, '');
        assert.equal(gitError.message, 'fatal: repository not found');
        assert.ok(gitError.cause instanceof Error);
        return true;
      }
    );
  });

  it('executes git commands in repository context', async () => {
    const calls: string[][] = [];

    __setGitRepositoryTestOverrides({
      execFileAsync: async (_command, args) => {
        calls.push(args);
        return { stdout: 'done', stderr: '' };
      },
    });

    const result = await executeGitCommandInRepo('/repo/path', ['status', '--short'], {
      maxBuffer: 4096,
    });

    assert.equal(result.stdout, 'done');
    assert.equal(result.stderr, '');
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ['-C', '/repo/path', 'status', '--short']);
  });

  it('extracts git error messages with fallbacks', () => {
    const wrapped = new GitCommandError('git', ['fetch'], {
      stderr: Buffer.from('fatal: access denied'),
    });
    assert.equal(extractGitErrorMessage(wrapped, 'fallback'), 'fatal: access denied');

    const plain = { stderr: Buffer.from('fatal: not found') };
    assert.equal(extractGitErrorMessage(plain, 'fallback'), 'fatal: not found');

    const fallback = { message: 'custom error' };
    assert.equal(extractGitErrorMessage(fallback, 'fallback'), 'custom error');
    assert.equal(extractGitErrorMessage({}, 'fallback'), 'fallback');
  });

  it('identifies not-found and conflict errors', () => {
    const notFoundError = new GitCommandError('git', ['fetch'], {
      stderr: Buffer.from('fatal: pathspec not found'),
    });
    assert.equal(isNotFoundError(notFoundError), true);

    const conflictError = new GitCommandError('git', ['merge'], {
      stderr: Buffer.from('error: merge conflict already exists'),
    });
    assert.equal(isConflictError(conflictError), true);

    const neutralError = new GitCommandError('git', ['status'], {
      stderr: Buffer.from('fatal: unexpected'),
    });
    assert.equal(isNotFoundError(neutralError), false);
    assert.equal(isConflictError(neutralError), false);
  });
});

