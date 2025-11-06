import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
  __setRepositoryCacheTestOverrides,
  refreshRepositoryCache,
} from './repository-cache.js';

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

    try {
      const result = await refreshRepositoryCache('/tmp/workdir');

      assert.deepEqual(result, sample);
      assert.equal(discover.mock.calls.length, 1);
      assert.equal(emit.mock.calls.length, 1);
      const [firstCall] = emit.mock.calls as Array<{ arguments: unknown[] }>;
      assert.ok(firstCall);
      assert.strictEqual(firstCall.arguments[0], sample);
    } finally {
      __setRepositoryCacheTestOverrides();
    }
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

    try {
      await assert.rejects(() => refreshRepositoryCache('/tmp/workdir'), /discovery failed/);
      assert.equal(emit.mock.calls.length, 0);
    } finally {
      __setRepositoryCacheTestOverrides();
    }
  });
});

