import { randomUUID } from 'node:crypto';

import { emitTasksUpdate } from './event-bus.js';

const tasks = new Map();
const COMPLETED_TASK_TTL_MS = 15 * 60 * 1000;

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
  const isFinal = task.status === 'succeeded' || task.status === 'failed';
  if (isFinal && !task.completedAt) {
    task.completedAt = now;
  }
  if (!isFinal && task.completedAt) {
    delete task.completedAt;
  }
  notify(task);
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
  for (const [taskId, task] of tasks) {
    if (!task) {
      tasks.delete(taskId);
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
    tasks.delete(taskId);
    emitTasksUpdate({ task: { id: taskId, removed: true } });
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
};
