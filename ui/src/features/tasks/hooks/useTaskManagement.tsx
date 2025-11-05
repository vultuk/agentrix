/**
 * Hook for managing tasks, pending launches, and task updates
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as tasksService from '../../../services/api/tasksService.js';
import { isAuthenticationError } from '../../../services/api/api-client.js';

interface UseTaskManagementOptions {
  onAuthExpired?: () => void;
  onTaskComplete?: (task: any) => void;
}

export function useTaskManagement({ onAuthExpired, onTaskComplete }: UseTaskManagementOptions = {}) {
  const [tasks, setTasks] = useState<any[]>([]);
  const taskMapRef = useRef(new Map<string, any>());
  const pendingLaunchesRef = useRef(new Map<string, any>());

  const processPendingTask = useCallback(
    (task: any) => {
      if (!task || typeof task !== 'object' || !task.id) {
        return;
      }
      const pending = pendingLaunchesRef.current.get(task.id);
      if (!pending) {
        return;
      }
      if (task.removed) {
        pendingLaunchesRef.current.delete(task.id);
        return;
      }
      if (task.status === 'failed') {
        pendingLaunchesRef.current.delete(task.id);
        const message =
          (task.error && typeof task.error.message === 'string' && task.error.message) ||
          'Worktree creation failed. Check server logs for details.';
        console.error('Worktree task failed', task.error || message);
        window.alert(`Worktree creation failed: ${message}`);
        return;
      }
      if (task.status !== 'succeeded') {
        return;
      }

      pendingLaunchesRef.current.delete(task.id);

      if (onTaskComplete) {
        onTaskComplete(task);
      }
    },
    [onTaskComplete],
  );

  const loadTasks = useCallback(async () => {
    try {
      const taskList = await tasksService.fetchTasks();
      const map = new Map();
      taskList.forEach((task: any) => {
        if (task && task.id) {
          map.set(task.id, task);
        }
      });
      taskMapRef.current = map;
      const sorted = Array.from(map.values()).sort((a, b) => {
        const timeA = Date.parse(a?.updatedAt || a?.createdAt || '') || 0;
        const timeB = Date.parse(b?.updatedAt || b?.createdAt || '') || 0;
        return timeB - timeA;
      });
      setTasks(sorted);
      taskList.forEach((task: any) => processPendingTask(task));
    } catch (error: any) {
      if (isAuthenticationError(error)) {
        if (onAuthExpired) {
          onAuthExpired();
        }
        return;
      }
      console.error('Failed to load tasks', error);
    }
  }, [onAuthExpired, processPendingTask]);

  const applyTaskUpdate = useCallback(
    (payload: any) => {
      if (!payload || typeof payload !== 'object') {
        return;
      }

      const map = new Map(taskMapRef.current);

      const upsertTask = (task: any) => {
        if (!task || typeof task !== 'object' || !task.id) {
          return;
        }
        if (task.removed) {
          map.delete(task.id);
          pendingLaunchesRef.current.delete(task.id);
          return;
        }
        map.set(task.id, task);
        processPendingTask(task);
      };

      if (Array.isArray(payload.tasks)) {
        payload.tasks.forEach((task: any) => {
          upsertTask(task);
        });
      } else if (payload.task) {
        upsertTask(payload.task);
      } else {
        return;
      }

      taskMapRef.current = map;
      const sorted = Array.from(map.values()).sort((a, b) => {
        const timeA = Date.parse(a?.updatedAt || a?.createdAt || '') || 0;
        const timeB = Date.parse(b?.updatedAt || b?.createdAt || '') || 0;
        return timeB - timeA;
      });
      setTasks(sorted);
    },
    [processPendingTask],
  );

  return {
    tasks,
    setTasks,
    taskMapRef,
    pendingLaunchesRef,
    loadTasks,
    applyTaskUpdate,
    processPendingTask,
  };
}

