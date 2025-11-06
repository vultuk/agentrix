import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { createTaskStore } from './task-store.js';

async function createTempDirectory(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'agentrix-task-store-'));
}

describe('createTaskStore', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await createTempDirectory();
  });

  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { force: true, recursive: true }).catch(() => {});
    }
  });

  it('throws when root is missing', () => {
    assert.throws(() => createTaskStore({ root: '' } as unknown as { root: string }), /Task store root directory is required/);
  });

  it('loads empty snapshot when file is missing', async () => {
    const store = createTaskStore({ root: tempRoot });
    const tasks = await store.loadSnapshot();
    assert.deepEqual(tasks, []);
  });

  it('saves snapshots atomically and exposes metadata', async () => {
    const snapshots: unknown[] = [{ id: 'one' }, { id: 'two' }];
    const store = createTaskStore({
      root: tempRoot,
      now: () => new Date('2024-01-02T03:04:05.000Z'),
    });

    await store.saveSnapshot(snapshots);

    const persisted = await readFile(store.filePath, 'utf8');
    const parsed = JSON.parse(persisted) as {
      version: number;
      generatedAt: string;
      tasks: unknown[];
    };

    assert.equal(parsed.version, 1);
    assert.equal(parsed.generatedAt, '2024-01-02T03:04:05.000Z');
    assert.deepEqual(parsed.tasks, snapshots);
    assert.equal(store.directory, join(tempRoot, '.agentrix'));

    const reloaded = await store.loadSnapshot();
    assert.deepEqual(reloaded, snapshots);
  });

  it('loads snapshot arrays directly', async () => {
    const store = createTaskStore({ root: tempRoot });
    await mkdir(dirname(store.filePath), { recursive: true });
    await writeFile(store.filePath, JSON.stringify([1, 2, 3]), 'utf8');

    const tasks = await store.loadSnapshot();
    assert.deepEqual(tasks, [1, 2, 3]);
  });

  it('logs warning and returns empty array on invalid JSON', async () => {
    const warnings: unknown[] = [];
    const logger = {
      warn: (...args: unknown[]) => {
        warnings.push(args);
      },
      error: () => {},
    } as unknown as Console;

    const store = createTaskStore({ root: tempRoot, logger });
    await mkdir(dirname(store.filePath), { recursive: true });
    await writeFile(store.filePath, '{invalid', 'utf8');

    const tasks = await store.loadSnapshot();
    assert.deepEqual(tasks, []);
    assert.ok(warnings.length >= 1);
    assert.match(String(warnings[0]?.[0] ?? ''), /Failed to load persisted tasks snapshot/);
  });

  it('serialises non-array values as empty array', async () => {
    const store = createTaskStore({ root: tempRoot });
    await store.saveSnapshot({ not: 'an array' });
    const raw = await readFile(store.filePath, 'utf8');
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed.tasks, []);
  });

  it('serialises concurrent calls sequentially', async () => {
    const store = createTaskStore({ root: tempRoot });

    await Promise.all([
      store.saveSnapshot([{ id: 1 }]),
      store.saveSnapshot([{ id: 2 }]),
      store.saveSnapshot([{ id: 3 }]),
    ]);

    const persisted = JSON.parse(await readFile(store.filePath, 'utf8'));
    assert.deepEqual(persisted.tasks, [{ id: 3 }]);
  });
});
