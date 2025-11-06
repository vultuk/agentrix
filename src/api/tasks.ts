import { getTaskById, listTasks } from '../core/tasks.js';
import { sendJson } from '../utils/http.js';
import { createSimpleHandler } from './base-handler.js';
import type { RequestContext } from '../types/http.js';

export interface TaskHandlersOverrides {
  listTasks?: typeof listTasks;
  getTaskById?: typeof getTaskById;
}

export function createTaskHandlers(overrides: TaskHandlersOverrides = {}) {
  const dependencies = {
    listTasks: overrides.listTasks ?? listTasks,
    getTaskById: overrides.getTaskById ?? getTaskById,
  };

  const list = createSimpleHandler(async () => ({ tasks: dependencies.listTasks() }));

  async function read(context: RequestContext, taskId: string): Promise<void> {
    const ctx = context as RequestContext & { params?: { id?: string } };
    const id = typeof taskId === 'string' && taskId ? taskId : ctx?.params?.id;
    if (!id) {
      sendJson(context.res, 400, { error: 'Task identifier is required' });
      return;
    }
    const task = dependencies.getTaskById(id);
    if (!task) {
      sendJson(context.res, 404, { error: 'Task not found' });
      return;
    }
    sendJson(context.res, 200, { task });
  }

  return { list, read };
}
