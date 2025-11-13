import assert from 'node:assert/strict';
import { describe, it, mock, afterEach } from 'node:test';

import {
  __setRepositoryCacheTestOverrides,
  __setRepositoryCacheSnapshot,
  getRepositoryCacheSnapshot,
  refreshRepositoryCache,
} from './repository-cache.js';

afterEach(() => {
  __setRepositoryCacheSnapshot(null);
  __setRepositoryCacheTestOverrides();
});

describe('refreshRepositoryCache', () => {
  it('refreshes repositories and emits update events', async () => {
    const sample = {
      vultuk: {
        agentrix: {
          branches: ['main'],
          initCommand: '',
        },
      },
    };

    const discover = mock.fn(async (workdir: string) => {
      assert.equal(workdir, '/tmp/workdir');
      return sample;
    });
    const emit = mock.fn(() => {});

    __setRepositoryCacheTestOverrides({
      discoverRepositories: discover,
      emitReposUpdate: emit,
    });

    const result = await refreshRepositoryCache('/tmp/workdir');

    assert.deepEqual(result, sample);
    assert.equal(discover.mock.calls.length, 1);
    assert.equal(emit.mock.calls.length, 1);
    const [firstCall] = emit.mock.calls as Array<{ arguments: unknown[] }>;
    assert.ok(firstCall);
    assert.strictEqual(firstCall.arguments[0], sample);
  });

  it('propagates discovery errors without emitting updates', async () => {
    const error = new Error('discovery failed');

    const discover = mock.fn(async () => {
      throw error;
    });
    const emit = mock.fn(() => {});

    __setRepositoryCacheTestOverrides({
      discoverRepositories: discover,
      emitReposUpdate: emit,
    });

    await assert.rejects(() => refreshRepositoryCache('/tmp/workdir'), /discovery failed/);
    assert.equal(emit.mock.calls.length, 0);
  });

  it('stores the refreshed snapshot for later retrieval', async () => {
    const sample = {
      vultuk: {
        agentrix: {
          branches: ['main'],
          initCommand: '',
        },
      },
    };

    __setRepositoryCacheTestOverrides({
      discoverRepositories: mock.fn(async () => sample),
      emitReposUpdate: mock.fn(),
    });

    await refreshRepositoryCache('/tmp/workdir');
    assert.strictEqual(getRepositoryCacheSnapshot(), sample);
  });
});

describe('repository cache snapshot helpers', () => {
  it('allows tests to preset the snapshot', () => {
    const preset = {
      org: {
        repo: {},
      },
    };

    __setRepositoryCacheSnapshot(preset);
    assert.strictEqual(getRepositoryCacheSnapshot(), preset);
  });
});
