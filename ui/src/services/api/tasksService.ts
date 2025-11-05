/**
 * Tasks API service
 */

import { apiGet, apiPost } from './api-client.js';
import type { Task } from '../../types/domain.js';

interface FetchTasksResponse {
  tasks: Task[];
}

/**
 * Fetch all tasks
 */
export async function fetchTasks(): Promise<Task[]> {
  const response = await apiGet<FetchTasksResponse>(
    '/api/tasks',
    { errorPrefix: 'Failed to fetch tasks' }
  );
  return response.tasks || [];
}

/**
 * Create an automation task
 */
export async function createTask(taskData: unknown): Promise<Task> {
  return await apiPost<Task>(
    '/api/tasks',
    taskData,
    { errorPrefix: 'Failed to create task' }
  );
}

