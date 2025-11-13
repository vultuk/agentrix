import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import type { Dirent, Stats } from 'node:fs';
import { afterEach, describe, it, mock } from 'node:test';

import {
  ensureRepository,
  cloneRepository,
  discoverRepositories,
  __setRepositoryRepositoryTestOverrides,
} from './repository-repository.js';
import { RepositoryIdentifierError } from '../domain/index.js';

function createDirent(name: string, isDirectory: boolean): Dirent {
  return {
    name,
    isDirectory: () => isDirectory,
  } as unknown as Dirent;
}

function createStats(isDirectory: boolean): Stats {
  return {
    isDirectory: () => isDirectory,
  } as unknown as Stats;
}

describe('repository-repository', () => {
  afterEach(() => {
    mock.restoreAll();
    __setRepositoryRepositoryTestOverrides();
  });

  describe('ensureRepository', () => {
    it('returns repository paths when directory exists', async () => {
      const statMock = mock.method(fs, 'stat', async (targetPath: string) => {
        assert.equal(targetPath, '/work/acme/demo/repository');
        return createStats(true);
      });

      const result = await ensureRepository('/work', 'acme', 'demo');
      assert.deepEqual(result, {
        repoRoot: '/work/acme/demo',
        repositoryPath: '/work/acme/demo/repository',
      });

      statMock.mock.restore();
    });

    it('throws when repository directory is missing', async () => {
      const statMock = mock.method(fs, 'stat', async () => {
        const error = new Error('not found') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      });

      await assert.rejects(
        ensureRepository('/work', 'acme', 'demo'),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /Repository not found/);
          return true;
        }
      );

      statMock.mock.restore();
    });

    it('rejects identifiers containing traversal segments', async () => {
      await assert.rejects(
        ensureRepository('/work', '..', 'demo'),
        (error: unknown) => {
          assert.ok(error instanceof RepositoryIdentifierError);
          assert.match(error.message, /organization cannot be a traversal segment/i);
          return true;
        }
      );
    });
  });

  describe('cloneRepository', () => {
    it('clones repository and persists init command', async () => {
      const mkdirMock = mock.method(fs, 'mkdir', async (targetPath: string) => {
        assert.equal(targetPath, '/work/acme/demo');
      });

      const statMock = mock.method(fs, 'stat', async () => {
        const error = new Error('missing') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      });

      const executeMock = mock.fn(async (args: string[]) => {
        assert.deepEqual(args, ['clone', 'https://github.com/acme/demo.git', '/work/acme/demo/repository']);
        return { stdout: '', stderr: '' };
      });

      const normaliseMock = mock.fn((command?: string) => {
        assert.equal(command, 'pnpm install');
        return 'pnpm install';
      });

      const setInitMock = mock.fn(async (repoRoot: string, command: string) => {
        assert.equal(repoRoot, '/work/acme/demo');
        assert.equal(command, 'pnpm install');
      });

      __setRepositoryRepositoryTestOverrides({
        executeGitCommand: async (args, options) => executeMock(args, options),
        normaliseInitCommand: normaliseMock,
        setRepositoryInitCommand: setInitMock,
      });

      const result = await cloneRepository('/work', 'https://github.com/acme/demo.git', {
        initCommand: 'pnpm install',
      });

      assert.deepEqual(result, { org: 'acme', repo: 'demo' });
      assert.equal(mkdirMock.mock.callCount(), 1);
      assert.equal(statMock.mock.callCount(), 1);
      assert.equal(executeMock.mock.callCount(), 1);
      assert.equal(normaliseMock.mock.callCount(), 1);
      assert.equal(setInitMock.mock.callCount(), 1);

      mkdirMock.mock.restore();
      statMock.mock.restore();
    });

    it('wraps git clone failures with descriptive errors', async () => {
      mock.method(fs, 'mkdir', async () => undefined);
      mock.method(fs, 'stat', async () => {
        const error = new Error('missing') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      });

      __setRepositoryRepositoryTestOverrides({
        executeGitCommand: async () => {
          const error = new Error('fatal') as { stderr?: Buffer };
          error.stderr = Buffer.from('fatal: authentication failed');
          throw error;
        },
      });

      await assert.rejects(
        cloneRepository('/work', 'https://github.com/acme/demo.git'),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /Failed to clone repository: fatal: authentication failed/);
          return true;
        }
      );
    });

    it('rejects repository URLs that attempt traversal before creating directories', async () => {
      const mkdirMock = mock.method(fs, 'mkdir', async () => {
        throw new Error('should not attempt mkdir');
      });

      await assert.rejects(
        cloneRepository('/work', 'git@github.com:../etc/passwd.git'),
        (error: unknown) => {
          assert.ok(error instanceof RepositoryIdentifierError);
          assert.match(error.message, /organization cannot be a traversal segment/i);
          return true;
        }
      );

      assert.equal(mkdirMock.mock.callCount(), 0);
      mkdirMock.mock.restore();
    });
  });

  describe('discoverRepositories', () => {
    it('returns repositories grouped by organisation with deduplicated branches', async () => {
      const readdirMock = mock.method(fs, 'readdir', async (targetPath: string) => {
        if (targetPath === '/work') {
          return [createDirent('acme', true), createDirent('temp.txt', false)];
        }

        if (targetPath === '/work/acme') {
          return [createDirent('demo', true), createDirent('scratch', false)];
        }

        throw new Error(`Unexpected readdir target: ${targetPath}`);
      });

      const statMock = mock.method(fs, 'stat', async (targetPath: string) => {
        if (targetPath === '/work/acme/demo/repository') {
          return createStats(true);
        }
        const error = new Error('missing') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      });

      const listWorktreesMock = mock.fn(async (repositoryPath: string) => {
        assert.equal(repositoryPath, '/work/acme/demo/repository');
        return [
          { branch: 'main', path: '/work/acme/demo/repository' },
          { branch: 'feature/login', path: '/work/acme/demo/feature-login' },
          { branch: 'feature/login', path: '/work/acme/demo/feature-login-alt' },
        ];
      });

      const getRepoInitMock = mock.fn(async (repoRoot: string) => {
        assert.equal(repoRoot, '/work/acme/demo');
        return 'pnpm install';
      });

      __setRepositoryRepositoryTestOverrides({
        listWorktrees: listWorktreesMock,
        getRepositoryInitCommand: getRepoInitMock,
      });

      const result = await discoverRepositories('/work');

      assert.deepEqual(result, {
        acme: {
          demo: {
            branches: ['main', 'feature/login'],
            initCommand: 'pnpm install',
          },
        },
      });

      assert.equal(readdirMock.mock.callCount(), 2);
      assert.equal(statMock.mock.callCount(), 1);
      assert.equal(listWorktreesMock.mock.callCount(), 1);
      assert.equal(getRepoInitMock.mock.callCount(), 1);
    });

    it('returns empty map when workdir is missing', async () => {
      mock.method(fs, 'readdir', async () => {
        const error = new Error('missing') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      });

      const result = await discoverRepositories('/missing');
      assert.deepEqual(result, {});
    });
  });
});
