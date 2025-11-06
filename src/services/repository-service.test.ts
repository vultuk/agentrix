import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import {
  RepositoryService,
  createRepositoryService,
  __setRepositoryServiceTestOverrides,
} from './repository-service.js';

describe('RepositoryService', () => {
  afterEach(() => {
    mock.restoreAll();
    __setRepositoryServiceTestOverrides();
  });

  it('lists repositories using repository discovery', async () => {
    const structure = { acme: { demo: { branches: ['main'] } } };
    const discoverMock = mock.fn(async (workdir: string) => {
      assert.equal(workdir, '/work');
      return structure;
    });

    __setRepositoryServiceTestOverrides({ discoverRepositories: discoverMock });

    const service = new RepositoryService('/work');
    const result = await service.listRepositories();

    assert.equal(discoverMock.mock.callCount(), 1);
    assert.strictEqual(result, structure);
  });

  it('clones repository and refreshes cache when adding repository', async () => {
    const cloneMock = mock.fn(async (workdir: string, url: string, options: unknown) => {
      assert.equal(workdir, '/work');
      assert.equal(url, 'https://github.com/acme/demo.git');
      assert.deepEqual(options, { initCommand: 'pnpm install' });
      return { org: 'acme', repo: 'demo' };
    });

    const cacheStructure = { acme: { demo: { branches: ['main'], initCommand: 'pnpm install' } } };
    const refreshMock = mock.fn(async (workdir: string) => {
      assert.equal(workdir, '/work');
      return cacheStructure;
    });

    __setRepositoryServiceTestOverrides({
      cloneRepository: cloneMock,
      refreshRepositoryCache: refreshMock,
    });

    const service = new RepositoryService('/work');
    const result = await service.addRepository('https://github.com/acme/demo.git', 'pnpm install');

    assert.deepEqual(result, {
      data: cacheStructure,
      repo: { org: 'acme', repo: 'demo' },
    });
    assert.equal(cloneMock.mock.callCount(), 1);
    assert.equal(refreshMock.mock.callCount(), 1);
  });

  it('removes repository and refreshes cache when deleting', async () => {
    const removeMock = mock.fn(async (workdir: string, org: string, repo: string) => {
      assert.equal(workdir, '/work');
      assert.equal(org, 'acme');
      assert.equal(repo, 'demo');
    });

    const cacheStructure = { acme: {} };
    const refreshMock = mock.fn(async () => cacheStructure);

    __setRepositoryServiceTestOverrides({
      removeRepository: removeMock,
      refreshRepositoryCache: refreshMock,
    });

    const service = new RepositoryService('/work');
    const result = await service.deleteRepository('acme', 'demo');

    assert.strictEqual(result, cacheStructure);
    assert.equal(removeMock.mock.callCount(), 1);
    assert.equal(refreshMock.mock.callCount(), 1);
  });

  it('updates init command after ensuring repository exists', async () => {
    const ensureMock = mock.fn(async () => ({
      repoRoot: '/work/acme/demo',
      repositoryPath: '/work/acme/demo/repository',
    }));

    const setInitMock = mock.fn(async (repoRoot: string, command: string) => {
      assert.equal(repoRoot, '/work/acme/demo');
      assert.equal(command, 'pnpm run bootstrap');
    });

    const cacheStructure = { acme: { demo: { initCommand: 'pnpm run bootstrap', branches: [] } } };
    const refreshMock = mock.fn(async () => cacheStructure);

    __setRepositoryServiceTestOverrides({
      ensureRepository: ensureMock,
      setRepositoryInitCommand: setInitMock,
      refreshRepositoryCache: refreshMock,
    });

    const service = new RepositoryService('/work');
    const result = await service.updateInitCommand('acme', 'demo', 'pnpm run bootstrap');

    assert.strictEqual(result, cacheStructure);
    assert.equal(ensureMock.mock.callCount(), 1);
    assert.equal(setInitMock.mock.callCount(), 1);
    assert.equal(refreshMock.mock.callCount(), 1);
  });

  it('creates service instance via factory', () => {
    const service = createRepositoryService('/work');
    assert.ok(service instanceof RepositoryService);
  });
});

