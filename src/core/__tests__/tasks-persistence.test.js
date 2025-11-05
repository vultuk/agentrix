import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

import {
  configureTaskPersistence,
  flushTaskPersistence,
  listTasks,
  runTask,
  _internals,
} from '../tasks.js';
import { createTaskStore } from '../task-store.js';

function createSilentLogger() {
  return {
    error() {},
    warn() {},
  };
}

async function createStoreRoot() {
  const root = await mkdtemp(join(tmpdir(), 'agentrix-tests-'));
  const store = createTaskStore({ root, logger: createSilentLogger() });
  return { root, store };
}

test('rehydrates running tasks as failed after restart', async (t) => {
  const { root, store } = await createStoreRoot();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  _internals.tasks.clear();

  const persistedTasks = [
    {
      id: 'task-running-1',
      type: 'automation',
      title: 'Example task',
      status: 'running',
      createdAt: '2025-01-01T09:00:00.000Z',
      updatedAt: '2025-01-01T09:05:00.000Z',
      metadata: { sample: true },
      steps: [
        {
          id: 'step-1',
          label: 'Do work',
          status: 'running',
          logs: [
            {
              id: 'log-1',
              message: 'Still running',
              timestamp: '2025-01-01T09:05:00.000Z',
            },
          ],
        },
      ],
    },
  ];

  await store.saveSnapshot(persistedTasks);

  const timestamps = {
    last: null,
  };
  const dynamicNow = () => {
    const current = new Date();
    timestamps.last = current;
    return current;
  };

  await configureTaskPersistence({
    loadSnapshot: () => store.loadSnapshot(),
    saveSnapshot: (snapshot) => store.saveSnapshot(snapshot),
    now: dynamicNow,
    logger: createSilentLogger(),
  });

  await flushTaskPersistence();

  const tasks = listTasks();
  assert.equal(tasks.length, 1);
  const task = tasks[0];
  assert.equal(task.id, 'task-running-1');
  assert.equal(task.status, 'failed');
  assert.equal(task.error.reason, 'process_restart');
  assert.match(task.error.message, /restart/i);
  assert.ok(timestamps.last instanceof Date);
  const completedAtMs = Date.parse(task.completedAt);
  assert.ok(Number.isFinite(completedAtMs));
  const deltaMs = Math.abs(completedAtMs - timestamps.last.getTime());
  assert.ok(
    deltaMs < 2000,
    `completedAt should be within 2s of now (delta ${deltaMs}ms)`,
  );
  assert.equal(task.steps.length, 1);
  assert.equal(task.steps[0].status, 'failed');
  const stepCompletedMs = Date.parse(task.steps[0].completedAt);
  assert.ok(Number.isFinite(stepCompletedMs));
  assert.ok(Math.abs(stepCompletedMs - timestamps.last.getTime()) < 2000);
  const lastLog = task.steps[0].logs[task.steps[0].logs.length - 1];
  assert.ok(lastLog);
  assert.ok(Math.abs(Date.parse(lastLog.timestamp) - timestamps.last.getTime()) < 2000);
  assert.match(lastLog.message, /process restart/i);

  const rawFile = await readFile(store.filePath, 'utf8');
  const parsed = JSON.parse(rawFile);
  assert.ok(Array.isArray(parsed.tasks));
  const persistedTask = parsed.tasks.find((entry) => entry.id === 'task-running-1');
  assert.equal(persistedTask.status, 'failed');
  assert.equal(persistedTask.error.reason, 'process_restart');
});

test('persists task lifecycle mutations to disk', async (t) => {
  const { root, store } = await createStoreRoot();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  _internals.tasks.clear();

  await configureTaskPersistence({
    loadSnapshot: () => store.loadSnapshot(),
    saveSnapshot: (snapshot) => store.saveSnapshot(snapshot),
    logger: createSilentLogger(),
  });

  const { id } = runTask(
    {
      type: 'demo-task',
      title: 'Demo Task',
    },
    async ({ progress, setResult }) => {
      progress.ensureStep('phase-one', 'Phase one');
      progress.startStep('phase-one', { message: 'Starting phase one' });
      progress.completeStep('phase-one', { message: 'Phase one complete' });
      setResult({ done: true });
      return { done: true };
    },
  );

  await delay(50);
  await flushTaskPersistence();

  const rawFile = await readFile(store.filePath, 'utf8');
  const parsed = JSON.parse(rawFile);
  assert.ok(Array.isArray(parsed.tasks));
  const persistedTask = parsed.tasks.find((entry) => entry.id === id);
  assert.ok(persistedTask, 'task should be persisted');
  assert.equal(persistedTask.status, 'succeeded');
  assert.ok(Array.isArray(persistedTask.steps));
  const persistedStep = persistedTask.steps.find((step) => step.id === 'phase-one');
  assert.ok(persistedStep);
  assert.equal(persistedStep.status, 'succeeded');
  assert.equal(persistedTask.result.done, true);
});
