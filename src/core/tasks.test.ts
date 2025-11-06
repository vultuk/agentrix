import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import {
  configureTaskPersistence,
  flushTaskPersistence,
  getPersistedTasksSnapshot,
  getTaskById,
  listTasks,
  runTask,
  _internals,
} from './tasks.js';
import { onTasksUpdate } from './event-bus.js';

function waitForTaskQueue(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(() => {
      setImmediate(resolve);
    });
  });
}

describe('tasks', () => {
  beforeEach(async () => {
    mock.restoreAll();
    _internals.tasks.clear();
    await configureTaskPersistence();
  });

  afterEach(async () => {
    await flushTaskPersistence().catch(() => {});
    mock.restoreAll();
    _internals.tasks.clear();
  });

  it('runs tasks, updates steps, and records results', async () => {
    const updates: unknown[] = [];
    const unsubscribe = onTasksUpdate((payload) => {
      updates.push(payload);
    });

    const handler = async (context: {
      progress: ReturnType<typeof _internals.createProgressController>;
      updateMetadata: (updates: Record<string, unknown>) => void;
      setResult: (result: unknown) => void;
      getTaskSnapshot: () => unknown;
    }) => {
      const { progress } = context;
      progress.ensureStep('initialise', 'Initialise');
      progress.startStep('initialise', { message: 'starting' });
      progress.completeStep('initialise', { message: 'completed' });
      progress.logStep('summary', 'done');
      progress.skipStep('optional');
      context.updateMetadata({ value: 42 });
      const snapshot = context.getTaskSnapshot();
      assert.ok(snapshot);
      context.setResult({ ok: true });
    };

    const { id } = runTask({ type: 'demo', title: 'Demo Task' }, handler as never);

    await waitForTaskQueue();

    const task = getTaskById(id);
    assert.ok(task);
    assert.equal(task?.status, 'succeeded');
    assert.equal(task?.result?.ok, true);
    assert.equal(task?.metadata?.value, 42);
    assert.ok(Array.isArray(task?.steps));
    assert.ok((task?.steps as unknown[]).length >= 2);
    assert.equal(task?.steps?.[0]?.status, 'succeeded');
    assert.equal(task?.steps?.[0]?.logs?.[0]?.message, 'starting');

    const listed = listTasks();
    assert.equal(listed.length, 1);
    assert.notStrictEqual(listed[0], task, 'listTasks returns cloned task');

    assert.ok(updates.length > 0, 'tasks updates emitted');
    unsubscribe();
  });

  it('captures handler failures and exposes error metadata', async () => {
    const error = new Error('boom');
    const { id } = runTask({ type: 'failure' }, async () => {
      throw error;
    });

    await waitForTaskQueue();

    const task = getTaskById(id);
    assert.ok(task);
    assert.equal(task?.status, 'failed');
    assert.equal(task?.error?.message, 'boom');
    assert.ok(task?.completedAt);
  });

  it('rehydrates persisted tasks and normalises snapshots', async () => {
    const savedSnapshots: unknown[] = [];
    const loadSnapshot = async () => [
      {
        id: 'restored',
        type: 'deploy',
        status: 'running',
        createdAt: 'invalid-date',
        updatedAt: 'invalid-date',
        metadata: { note: 'in-flight' },
        steps: [
          {
            id: 'step-1',
            status: 'running',
            logs: [{ message: 'progressing', timestamp: 'invalid' }],
          },
        ],
      },
    ];

    await configureTaskPersistence({
      loadSnapshot,
      saveSnapshot: async (snapshot) => {
        savedSnapshots.push(snapshot);
      },
      debounceMs: 0,
      logger: {
        warn: () => {},
        error: () => {},
      } as unknown as Console,
    });

    await flushTaskPersistence();

    const tasks = listTasks();
    assert.equal(tasks.length, 1);
    const restored = tasks[0];
    assert.equal(restored.status, 'failed');
    assert.equal(restored.error?.reason, 'process_restart');
    assert.ok(Array.isArray(restored.steps));
    assert.equal(restored.steps?.[0]?.status, 'failed');
    assert.ok(
      restored.steps?.[0]?.logs?.some((log: { message: string }) =>
        /Step marked as failed/i.test(log.message),
      ),
    );

    assert.ok(savedSnapshots.length >= 1);
    const snapshot = savedSnapshots.at(-1) as Array<{ id: string }> | undefined;
    assert.ok(snapshot);
    assert.equal(snapshot?.[0]?.id, 'restored');

    const persisted = getPersistedTasksSnapshot();
    assert.equal(persisted.length, 1);
  });
});


