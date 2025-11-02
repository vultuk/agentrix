import { randomUUID } from 'node:crypto';

import { emitTasksUpdate } from './event-bus.js';

const tasks = new Map();
const COMPLETED_TASK_TTL_MS = 15 * 60 * 1000;

const TASK_FINAL_STATUSES = new Set(['succeeded', 'failed']);
const STEP_FINAL_STATUSES = new Set(['succeeded', 'skipped', 'failed']);

let persistenceConfig = null;
let persistTimer = null;
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

function logPersistenceError(error) {
  const logger = persistenceConfig?.logger;
  if (logger && typeof logger.error === 'function') {
    logger.error('[terminal-worktree] Failed to persist tasks:', error);
  }
}

function logPersistenceWarning(message, error) {
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
        await persistenceConfig.saveSnapshot(getTasksSnapshot());
      })
      .catch((error) => {
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
        await persistenceConfig.saveSnapshot(getTasksSnapshot());
      })
      .catch((error) => {
        logPersistenceError(error);
      });
  }, delay);
  if (typeof persistTimer.unref === 'function') {
    persistTimer.unref();
  }

  return persistQueue;
}

function cloneTask(task) {
  return JSON.parse(JSON.stringify(task));
}

function notify(task) {
  emitTasksUpdate({ task: cloneTask(task) });
}

function appendLog(step, message) {
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

function ensureStep(task, id, label) {
  if (!task.steps) {
    task.steps = [];
  }
  let step = task.steps.find((entry) => entry && entry.id === id);
  if (!step) {
    step = {
      id,
      label: label || id,
      status: 'pending',
      logs: [],
    };
    task.steps.push(step);
    return step;
  }
  if (typeof label === 'string' && label && label !== step.label) {
    step.label = label;
  }
  return step;
}

function mutateTask(task, mutator) {
  if (!task || typeof mutator !== 'function') {
    return;
  }
  mutator(task);
  const now = new Date().toISOString();
  task.updatedAt = now;
  const isFinal = TASK_FINAL_STATUSES.has(task.status);
  if (isFinal && !task.completedAt) {
    task.completedAt = now;
  }
  if (!isFinal && task.completedAt) {
    delete task.completedAt;
  }
  notify(task);
  schedulePersistence();
  pruneExpiredTasks();
}

function createProgressController(task) {
  return {
    ensureStep(id, label) {
      mutateTask(task, (draft) => {
        ensureStep(draft, id, label);
      });
    },
    startStep(id, { label, message } = {}) {
      mutateTask(task, (draft) => {
        const step = ensureStep(draft, id, label);
        if (!step.startedAt) {
          step.startedAt = new Date().toISOString();
        }
        step.status = 'running';
        if (message) {
          appendLog(step, message);
        }
      });
    },
    logStep(id, message) {
      mutateTask(task, (draft) => {
        const step = ensureStep(draft, id);
        appendLog(step, message);
      });
    },
    completeStep(id, { label, message } = {}) {
      mutateTask(task, (draft) => {
        const step = ensureStep(draft, id, label);
        step.status = 'succeeded';
        step.completedAt = new Date().toISOString();
        if (message) {
          appendLog(step, message);
        }
      });
    },
    skipStep(id, { label, message } = {}) {
      mutateTask(task, (draft) => {
        const step = ensureStep(draft, id, label);
        step.status = 'skipped';
        step.completedAt = new Date().toISOString();
        if (message) {
          appendLog(step, message);
        }
      });
    },
    failStep(id, { label, message } = {}) {
      mutateTask(task, (draft) => {
        const step = ensureStep(draft, id, label);
        step.status = 'failed';
        step.completedAt = new Date().toISOString();
        if (message) {
          appendLog(step, message);
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

export function runTask(config, handler) {
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
    metadata: { ...metadata },
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
    updateMetadata(updates = {}) {
      if (!updates || typeof updates !== 'object') {
        return;
      }
      mutateTask(task, (draft) => {
        draft.metadata = { ...draft.metadata, ...updates };
      });
    },
    setResult(result) {
      mutateTask(task, (draft) => {
        draft.result = result;
      });
    },
    getTaskSnapshot() {
      return cloneTask(task);
    },
  };

  setImmediate(async () => {
    mutateTask(task, (draft) => {
      draft.status = 'running';
    });

    try {
      const result = await handler(context);
      if (typeof result !== 'undefined') {
        mutateTask(task, (draft) => {
          draft.result = result;
        });
      }
      mutateTask(task, (draft) => {
        draft.status = 'succeeded';
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      mutateTask(task, (draft) => {
        draft.status = 'failed';
        draft.error = { message };
      });
    }
  });

  return { id, task: cloneTask(task) };
}

export function listTasks() {
  pruneExpiredTasks();
  return Array.from(tasks.values(), (task) => cloneTask(task));
}

function normaliseTimestamp(value, fallbackIso) {
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

function normaliseLogEntry(entry, fallbackIso) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const message = typeof entry.message === 'string' ? entry.message.trim() : '';
  if (!message) {
    return null;
  }
  const timestampCandidate = typeof entry.timestamp === 'string' ? entry.timestamp : null;
  const { iso: timestamp } = normaliseTimestamp(timestampCandidate, fallbackIso);
  const id = typeof entry.id === 'string' && entry.id ? entry.id : randomUUID();
  return { id, message, timestamp };
}

function normaliseStepSnapshot(stepInput, { nowIso }) {
  const source = stepInput && typeof stepInput === 'object' ? stepInput : {};
  const copy = JSON.parse(JSON.stringify(source));
  const result = {
    id: typeof copy.id === 'string' && copy.id ? copy.id : randomUUID(),
    label: typeof copy.label === 'string' && copy.label ? copy.label : undefined,
    status: typeof copy.status === 'string' ? copy.status : 'pending',
    logs: Array.isArray(copy.logs) ? copy.logs : [],
  };

  let changed = false;

  if (!result.label) {
    result.label = result.id;
    changed = true;
  }

  const allowedStatuses = ['pending', 'running', 'succeeded', 'failed', 'skipped'];
  if (!allowedStatuses.includes(result.status)) {
    result.status = 'pending';
    changed = true;
  }

  const logs = [];
  for (const logEntry of result.logs) {
    const log = normaliseLogEntry(logEntry, nowIso);
    if (!log) {
      changed = true;
      continue;
    }
    logs.push(log);
    if (
      !logEntry ||
      logEntry.id !== log.id ||
      logEntry.message !== log.message ||
      logEntry.timestamp !== log.timestamp
    ) {
      changed = true;
    }
  }
  result.logs = logs;

  if (copy.completedAt) {
    const { iso, changed: completedChanged } = normaliseTimestamp(copy.completedAt, nowIso);
    result.completedAt = iso;
    if (completedChanged) {
      changed = true;
    }
  }

  return { step: result, changed };
}

function rehydratePersistedTask(rawTask, context) {
  if (!rawTask || typeof rawTask !== 'object') {
    return null;
  }
  const copy = JSON.parse(JSON.stringify(rawTask));
  const id = typeof copy.id === 'string' ? copy.id.trim() : '';
  if (!id) {
    return null;
  }

  const nowIso = getNowIso(context.now);

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

  const steps = [];
  for (const entry of task.steps) {
    const normalised = normaliseStepSnapshot(entry, { nowIso });
    if (!normalised) {
      changed = true;
      continue;
    }
    steps.push(normalised.step);
    if (normalised.changed) {
      changed = true;
    }
  }
  task.steps = steps;

  if (!TASK_FINAL_STATUSES.has(task.status)) {
    changed = true;
    task.status = 'failed';
    task.updatedAt = nowIso;
    task.completedAt = nowIso;
    const error = task.error && typeof task.error === 'object' ? { ...task.error } : {};
    const existingMessage =
      typeof error.message === 'string' && error.message.trim()
        ? `${error.message.trim()} (aborted due to restart)`
        : context.restartTaskMessage;
    error.message = existingMessage;
    error.reason = context.restartReason;
    task.error = error;
    task.steps = task.steps.map((step) => {
      if (STEP_FINAL_STATUSES.has(step.status)) {
        return step;
      }
      const logs = Array.isArray(step.logs) ? step.logs.slice() : [];
      logs.push({
        id: randomUUID(),
        message: context.restartStepMessage,
        timestamp: nowIso,
      });
      return {
        ...step,
        status: 'failed',
        completedAt: nowIso,
        logs,
      };
    });
  } else if (task.status === 'failed') {
    if (!task.completedAt) {
      task.completedAt = task.updatedAt;
      changed = true;
    }
    if (task.error && typeof task.error.message !== 'string') {
      task.error.message = context.defaultFailureMessage;
      changed = true;
    }
  } else if (task.status === 'succeeded' && !task.completedAt) {
    task.completedAt = task.updatedAt;
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
  now = () => new Date(),
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
    loadSnapshot: typeof loadSnapshot === 'function' ? loadSnapshot : null,
    saveSnapshot,
    debounceMs,
    restartTaskMessage,
    restartStepMessage,
    restartReason,
    defaultFailureMessage,
    logger,
    now,
  };

  let loadedTasks = [];

  if (persistenceConfig.loadSnapshot) {
    try {
      loadedTasks = await persistenceConfig.loadSnapshot();
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
      const result = rehydratePersistedTask(entry, persistenceConfig);
      if (!result || !result.task) {
        needsPersist = true;
        continue;
      }
      tasks.set(result.task.id, result.task);
      if (result.changed) {
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

export function getTaskById(taskId) {
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
