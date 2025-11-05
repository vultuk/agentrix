import { randomUUID } from 'node:crypto';

import { emitTasksUpdate } from './event-bus.js';

const tasks = new Map();
const COMPLETED_TASK_TTL_MS = 15 * 60 * 1000;

const TASK_FINAL_STATUSES = new Set(['succeeded', 'failed']);
const STEP_FINAL_STATUSES = new Set(['succeeded', 'skipped', 'failed']);

let persistenceConfig: {
  saveSnapshot?: (snapshot: unknown) => Promise<void>;
  loadSnapshot?: () => Promise<unknown>;
  logger?: Console;
  debounceMs?: number;
  restartTaskMessage?: string;
  restartStepMessage?: string;
  restartReason?: string;
  defaultFailureMessage?: string;
} | null = null;
let persistTimer: NodeJS.Timeout | null = null;
let pendingPersist = false;
let persistQueue = Promise.resolve();

function getNowIso(now = () => new Date()) {
  const value = now();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function getTasksSnapshot() {
  return Array.from(tasks.values(), (task) => cloneTask(task));
}

function logPersistenceError(error: unknown): void {
  const logger = persistenceConfig?.logger;
  if (logger && typeof logger.error === 'function') {
    logger.error('[terminal-worktree] Failed to persist tasks:', error);
  }
}

function logPersistenceWarning(message: string, error?: unknown): void {
  const logger = persistenceConfig?.logger;
  if (logger && typeof logger.warn === 'function') {
    if (error) {
      logger.warn(message, error);
    } else {
      logger.warn(message);
    }
  }
}

function schedulePersistence(immediate = false) {
  if (!persistenceConfig?.saveSnapshot) {
    return Promise.resolve();
  }

  if (immediate) {
    pendingPersist = false;
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    persistQueue = persistQueue
      .then(async () => {
        if (persistenceConfig?.saveSnapshot) {
          await persistenceConfig.saveSnapshot(getTasksSnapshot());
        }
      })
      .catch((error: unknown) => {
        logPersistenceError(error);
      });
    return persistQueue;
  }

  pendingPersist = true;
  if (persistTimer) {
    return persistQueue;
  }

  const delay = Math.max(0, persistenceConfig.debounceMs ?? 200);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!pendingPersist) {
      return;
    }
    pendingPersist = false;
    persistQueue = persistQueue
      .then(async () => {
        if (persistenceConfig?.saveSnapshot) {
          await persistenceConfig.saveSnapshot(getTasksSnapshot());
        }
      })
      .catch((error: unknown) => {
        logPersistenceError(error);
      });
  }, delay);
  if (typeof persistTimer.unref === 'function') {
    persistTimer.unref();
  }

  return persistQueue;
}

function cloneTask(task: unknown): unknown {
  return JSON.parse(JSON.stringify(task));
}

function notify(task: unknown): void {
  emitTasksUpdate({ task: cloneTask(task) });
}

function appendLog(step: { logs?: Array<{ id: string; message: string; timestamp: string }> }, message: string): void {
  if (!step || typeof message !== 'string') {
    return;
  }
  const trimmed = message.trim();
  if (!trimmed) {
    return;
  }
  if (!Array.isArray(step.logs)) {
    step.logs = [];
  }
  step.logs.push({
    id: randomUUID(),
    message: trimmed,
    timestamp: new Date().toISOString(),
  });
}

function ensureStep(task: { steps?: unknown[] }, id: string, label?: string): unknown {
  if (!task.steps) {
    task.steps = [];
  }
  const taskSteps = task.steps as Array<{ id: string; label?: string; status?: string; logs?: unknown[] }>;
  let step = taskSteps.find((entry) => entry && entry.id === id);
  if (!step) {
    step = {
      id,
      label: label || id,
      status: 'pending',
      logs: [],
    };
    taskSteps.push(step);
    return step;
  }
  if (typeof label === 'string' && label && label !== step.label) {
    step.label = label;
  }
  return step;
}

function mutateTask(task: unknown, mutator: (task: unknown) => void): void {
  if (!task || typeof mutator !== 'function') {
    return;
  }
  const taskRecord = task as { updatedAt?: string; status?: string; completedAt?: string };
  mutator(task);
  const now = new Date().toISOString();
  taskRecord.updatedAt = now;
  const isFinal = TASK_FINAL_STATUSES.has(taskRecord.status || '');
  if (isFinal && !taskRecord.completedAt) {
    taskRecord.completedAt = now;
  }
  if (!isFinal && taskRecord.completedAt) {
    delete taskRecord.completedAt;
  }
  notify(task);
  schedulePersistence();
  pruneExpiredTasks();
}

function createProgressController(task: unknown): unknown {
  return {
    ensureStep(id: string, label?: string): void {
      mutateTask(task, (draft) => {
        ensureStep(draft as { steps?: unknown[] }, id, label);
      });
    },
    startStep(id: string, { label, message }: { label?: string; message?: string } = {}): void {
      mutateTask(task, (draft) => {
        const step = ensureStep(draft as { steps?: unknown[] }, id, label) as { startedAt?: string; status?: string };
        if (!step.startedAt) {
          step.startedAt = new Date().toISOString();
        }
        step.status = 'running';
        if (message) {
          appendLog(step as never, message);
        }
      });
    },
    logStep(id: string, message: string): void {
      mutateTask(task, (draft) => {
        const step = ensureStep(draft as { steps?: unknown[] }, id);
        appendLog(step as never, message);
      });
    },
    completeStep(id: string, { label, message }: { label?: string; message?: string } = {}): void {
      mutateTask(task, (draft) => {
        const step = ensureStep(draft as { steps?: unknown[] }, id, label) as { status?: string; completedAt?: string };
        step.status = 'succeeded';
        step.completedAt = new Date().toISOString();
        if (message) {
          appendLog(step as never, message);
        }
      });
    },
    skipStep(id: string, { label, message }: { label?: string; message?: string } = {}): void {
      mutateTask(task, (draft) => {
        const step = ensureStep(draft as { steps?: unknown[] }, id, label) as { status?: string; completedAt?: string };
        step.status = 'skipped';
        step.completedAt = new Date().toISOString();
        if (message) {
          appendLog(step as never, message);
        }
      });
    },
    failStep(id: string, { label, message }: { label?: string; message?: string } = {}): void {
      mutateTask(task, (draft) => {
        const step = ensureStep(draft as { steps?: unknown[] }, id, label) as { status?: string; completedAt?: string };
        step.status = 'failed';
        step.completedAt = new Date().toISOString();
        if (message) {
          appendLog(step as never, message);
        }
      });
    },
  };
}

function pruneExpiredTasks() {
  const now = Date.now();
  let removedAny = false;
  for (const [taskId, task] of tasks) {
    if (!task) {
      tasks.delete(taskId);
      removedAny = true;
      continue;
    }
    if (!task.completedAt) {
      continue;
    }
    const completedAt = new Date(task.completedAt).getTime();
    if (Number.isNaN(completedAt)) {
      continue;
    }
    if (now - completedAt < COMPLETED_TASK_TTL_MS) {
      continue;
    }
    if (tasks.delete(taskId)) {
      removedAny = true;
      emitTasksUpdate({ task: { id: taskId, removed: true } });
    }
  }
  if (removedAny) {
    schedulePersistence();
  }
}

export function runTask(config: { type: string; title?: string; metadata?: unknown }, handler: (context: unknown) => Promise<unknown>): { id: string; task: unknown } {
  if (!config || typeof config !== 'object') {
    throw new Error('Task configuration is required');
  }
  const { type, title, metadata = {} } = config;
  if (!type) {
    throw new Error('Task type is required');
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const task = {
    id,
    type,
    title: typeof title === 'string' && title ? title : type,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    metadata: typeof metadata === 'object' && metadata !== null ? { ...metadata as Record<string, unknown> } : {},
    steps: [],
    result: null,
    error: null,
  };

  tasks.set(id, task);
  notify(task);
  schedulePersistence();
  pruneExpiredTasks();

  const progress = createProgressController(task);

  const context = {
    progress,
    updateMetadata(updates: Record<string, unknown> = {}) {
      if (!updates || typeof updates !== 'object') {
        return;
      }
      mutateTask(task, (draft) => {
        const draftRecord = draft as { metadata?: Record<string, unknown> };
        draftRecord.metadata = { ...draftRecord.metadata, ...updates };
      });
    },
    setResult(result: unknown) {
      mutateTask(task, (draft) => {
        const draftRecord = draft as { result?: unknown };
        draftRecord.result = result;
      });
    },
    getTaskSnapshot() {
      return cloneTask(task);
    },
  };

  setImmediate(async () => {
    mutateTask(task, (draft) => {
      const draftRecord = draft as { status?: string };
      draftRecord.status = 'running';
    });

    try {
      const result = await handler(context);
      if (typeof result !== 'undefined') {
        mutateTask(task, (draft) => {
          const draftRecord = draft as { result?: unknown };
          draftRecord.result = result;
        });
      }
      mutateTask(task, (draft) => {
        const draftRecord = draft as { status?: string };
        draftRecord.status = 'succeeded';
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      mutateTask(task, (draft) => {
        const draftRecord = draft as { status?: string; error?: { message: string } };
        draftRecord.status = 'failed';
        draftRecord.error = { message };
      });
    }
  });

  return { id, task: cloneTask(task) };
}

export function listTasks() {
  pruneExpiredTasks();
  return Array.from(tasks.values(), (task) => cloneTask(task));
}

function normaliseTimestamp(value: unknown, fallbackIso: string): { iso: string; changed: boolean } {
  const input = typeof value === 'string' ? value.trim() : '';
  if (!input) {
    return { iso: fallbackIso, changed: true };
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return { iso: fallbackIso, changed: true };
  }
  const iso = parsed.toISOString();
  return { iso, changed: iso !== input };
}

function normaliseLogEntry(entry: unknown, fallbackIso: string): { id: string; message: string; timestamp: string } | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const entryRecord = entry as { message?: string; timestamp?: string; id?: string };
  const message = typeof entryRecord.message === 'string' ? entryRecord.message.trim() : '';
  if (!message) {
    return null;
  }
  const timestampCandidate = typeof entryRecord.timestamp === 'string' ? entryRecord.timestamp : null;
  const { iso: timestamp } = normaliseTimestamp(timestampCandidate, fallbackIso);
  const id = typeof entryRecord.id === 'string' && entryRecord.id ? entryRecord.id : randomUUID();
  return { id, message, timestamp };
}

function normaliseStepSnapshot(stepInput: unknown, { nowIso }: { nowIso: string }): { step: unknown; changed: boolean } | null {
  const source = stepInput && typeof stepInput === 'object' ? stepInput : {};
  const copy = JSON.parse(JSON.stringify(source)) as Record<string, unknown>;
  const result: Record<string, unknown> = {
    id: typeof copy['id'] === 'string' && copy['id'] ? copy['id'] : randomUUID(),
    label: typeof copy['label'] === 'string' && copy['label'] ? copy['label'] : undefined,
    status: typeof copy['status'] === 'string' ? copy['status'] : 'pending',
    logs: Array.isArray(copy['logs']) ? copy['logs'] : [],
  };

  let changed = false;

  if (!result['label']) {
    result['label'] = result['id'];
    changed = true;
  }

  const allowedStatuses = ['pending', 'running', 'succeeded', 'failed', 'skipped'];
  if (!allowedStatuses.includes(result['status'] as string)) {
    result['status'] = 'pending';
    changed = true;
  }

  const logs: Array<{ id: string; message: string; timestamp: string }> = [];
  for (const logEntry of result['logs'] as unknown[]) {
    const log = normaliseLogEntry(logEntry, nowIso);
    if (!log) {
      changed = true;
      continue;
    }
    logs.push(log);
    const entryRecord = logEntry as { id?: string; message?: string; timestamp?: string };
    if (
      !logEntry ||
      entryRecord.id !== log.id ||
      entryRecord.message !== log.message ||
      entryRecord.timestamp !== log.timestamp
    ) {
      changed = true;
    }
  }
  result['logs'] = logs;

  if (copy['completedAt']) {
    const { iso, changed: completedChanged } = normaliseTimestamp(copy['completedAt'], nowIso);
    result['completedAt'] = iso;
    if (completedChanged) {
      changed = true;
    }
  }

  return { step: result, changed };
}

function rehydratePersistedTask(rawTask: unknown, context: unknown): unknown {
  if (!rawTask || typeof rawTask !== 'object') {
    return null;
  }
  const ctx = context as { now?: () => Date; restartTaskMessage?: string; restartStepMessage?: string; restartReason?: string; defaultFailureMessage?: string };
  const copy = JSON.parse(JSON.stringify(rawTask));
  const id = typeof copy.id === 'string' ? copy.id.trim() : '';
  if (!id) {
    return null;
  }

  const nowIso = getNowIso(ctx.now);

  const task = {
    id,
    type: typeof copy.type === 'string' && copy.type ? copy.type : 'task',
    title: typeof copy.title === 'string' && copy.title ? copy.title : undefined,
    status: typeof copy.status === 'string' ? copy.status : 'pending',
    createdAt: copy.createdAt,
    updatedAt: copy.updatedAt,
    completedAt: copy.completedAt,
    metadata:
      copy.metadata && typeof copy.metadata === 'object' && !Array.isArray(copy.metadata)
        ? { ...copy.metadata }
        : {},
    steps: Array.isArray(copy.steps) ? copy.steps : [],
    result: Object.prototype.hasOwnProperty.call(copy, 'result') ? copy.result : null,
    error:
      copy.error && typeof copy.error === 'object' && !Array.isArray(copy.error)
        ? { ...copy.error }
        : null,
  };

  if (!task.title) {
    task.title = task.type;
  }

  let changed = false;

  const created = normaliseTimestamp(task.createdAt, nowIso);
  task.createdAt = created.iso;
  if (created.changed) {
    changed = true;
  }

  const updated = normaliseTimestamp(task.updatedAt, task.createdAt);
  task.updatedAt = updated.iso;
  if (updated.changed) {
    changed = true;
  }

  if (task.completedAt) {
    const completed = normaliseTimestamp(task.completedAt, task.updatedAt);
    task.completedAt = completed.iso;
    if (completed.changed) {
      changed = true;
    }
  }

  const steps: unknown[] = [];
  const taskSteps = task['steps'] as unknown[];
  for (const entry of taskSteps) {
    const normalised = normaliseStepSnapshot(entry, { nowIso });
    if (!normalised) {
      changed = true;
      continue;
    }
    steps.push(normalised['step']);
    if (normalised['changed']) {
      changed = true;
    }
  }
  task['steps'] = steps;

  const taskRecord = task as { status?: string; updatedAt?: string; completedAt?: string; error?: unknown; steps?: unknown[] };
  if (!TASK_FINAL_STATUSES.has(taskRecord.status || '')) {
    changed = true;
    taskRecord.status = 'failed';
    taskRecord.updatedAt = nowIso;
    taskRecord.completedAt = nowIso;
    const errorObj = taskRecord.error && typeof taskRecord.error === 'object' ? { ...(taskRecord.error as Record<string, unknown>) } : {};
    const errorRecord = errorObj as { message?: string; reason?: string };
    const existingMessage =
      typeof errorRecord.message === 'string' && errorRecord.message.trim()
        ? `${errorRecord.message.trim()} (aborted due to restart)`
        : ctx.restartTaskMessage;
    errorRecord.message = existingMessage || '';
    errorRecord.reason = ctx.restartReason;
    taskRecord.error = errorRecord;
    task.steps = task["steps"].map((step: unknown) => {
      const stepRecord = step as { status?: string; logs?: unknown[] };
      if (STEP_FINAL_STATUSES.has(stepRecord.status || '')) {
        return step;
      }
      const logs = Array.isArray(stepRecord.logs) ? stepRecord.logs.slice() : [];
      logs.push({
        id: randomUUID(),
        message: ctx.restartStepMessage || 'Step failed',
        timestamp: nowIso,
      });
      return {
        ...(step as Record<string, unknown>),
        status: 'failed',
        completedAt: nowIso,
        logs,
      };
    });
  } else if (taskRecord.status === 'failed') {
    if (!taskRecord.completedAt) {
      taskRecord.completedAt = taskRecord.updatedAt;
      changed = true;
    }
    const errorRec = taskRecord.error as { message?: string };
    if (errorRec && typeof errorRec.message !== 'string') {
      errorRec.message = ctx.defaultFailureMessage;
      changed = true;
    }
  } else if (taskRecord.status === 'succeeded' && !taskRecord.completedAt) {
    taskRecord.completedAt = taskRecord.updatedAt;
    changed = true;
  }

  return { task, changed };
}

export async function configureTaskPersistence({
  loadSnapshot,
  saveSnapshot,
  debounceMs = 200,
  restartTaskMessage = 'Task failed because terminal-worktree restarted while it was running.',
  restartStepMessage = 'Step marked as failed after process restart.',
  restartReason = 'process_restart',
  defaultFailureMessage = 'Task failed.',
  logger = console,
}: {
  loadSnapshot?: () => Promise<unknown>;
  saveSnapshot?: (snapshot: unknown) => Promise<void>;
  debounceMs?: number;
  restartTaskMessage?: string;
  restartStepMessage?: string;
  restartReason?: string;
  defaultFailureMessage?: string;
  logger?: Console;
} = {}) {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  pendingPersist = false;
  persistQueue = Promise.resolve();

  if (typeof saveSnapshot !== 'function') {
    persistenceConfig = null;
    tasks.clear();
    return;
  }

  persistenceConfig = {
    loadSnapshot: typeof loadSnapshot === 'function' ? loadSnapshot : undefined,
    saveSnapshot,
    debounceMs,
    restartTaskMessage,
    restartStepMessage,
    restartReason,
    defaultFailureMessage,
    logger,
  };

  let loadedTasks: unknown[] = [];

  if (persistenceConfig.loadSnapshot) {
    try {
      const loaded = await persistenceConfig.loadSnapshot();
      loadedTasks = Array.isArray(loaded) ? loaded : [];
    } catch (error) {
      logPersistenceWarning(
        '[terminal-worktree] Failed to load persisted tasks snapshot:',
        error instanceof Error ? error : new Error(String(error)),
      );
      loadedTasks = [];
    }
  }

  tasks.clear();
  let needsPersist = false;

  if (Array.isArray(loadedTasks)) {
    for (const entry of loadedTasks) {
      const result = rehydratePersistedTask(entry, persistenceConfig) as { task?: { id: string }; changed?: boolean } | null;
      if (!result || !result['task']) {
        needsPersist = true;
        continue;
      }
      const restoredTask = result['task'] as { id: string };
      tasks.set(restoredTask.id, result['task']);
      if (result['changed']) {
        needsPersist = true;
      }
    }
  }

  if (needsPersist || tasks.size > 0) {
    await schedulePersistence(true);
  } else {
    await schedulePersistence(true);
  }
}

export function getPersistedTasksSnapshot() {
  return getTasksSnapshot();
}

export async function flushTaskPersistence() {
  await schedulePersistence(true);
}

export function getTaskById(taskId: string) {
  if (!taskId) {
    return null;
  }
  const task = tasks.get(taskId);
  return task ? cloneTask(task) : null;
}

export const _internals = {
  tasks,
  ensureStep,
  mutateTask,
  createProgressController,
  pruneExpiredTasks,
  COMPLETED_TASK_TTL_MS,
  schedulePersistence,
  getTasksSnapshot,
  normaliseTimestamp,
  normaliseLogEntry,
  normaliseStepSnapshot,
  rehydratePersistedTask,
};
