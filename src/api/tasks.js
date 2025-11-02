import { getTaskById, listTasks } from '../core/tasks.js';
import { sendJson } from '../utils/http.js';

export function createTaskHandlers() {
  async function list(context) {
    const tasks = listTasks();
    sendJson(context.res, 200, { tasks });
  }

  async function read(context, taskId) {
    const id = typeof taskId === 'string' && taskId ? taskId : context?.params?.id;
    if (!id) {
      sendJson(context.res, 400, { error: 'Task identifier is required' });
      return;
    }
    const task = getTaskById(id);
    if (!task) {
      sendJson(context.res, 404, { error: 'Task not found' });
      return;
    }
    sendJson(context.res, 200, { task });
  }

  return { list, read };
}
