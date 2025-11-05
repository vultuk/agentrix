/**
 * Custom hook for managing automation tasks and real-time updates via SSE
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createEventStream } from '../utils/eventStream.js';

export interface TaskLog {
  id?: string;
  timestamp?: string | Date | number;
  message?: string;
}

export interface TaskStep {
  id?: string;
  status?: string;
  label?: string;
  logs?: TaskLog[];
}

export interface TaskError {
  message?: string;
}

export interface TaskMetadata {
  org?: string;
  repo?: string;
  branch?: string;
}

export interface TaskResult {
  org?: string;
  repo?: string;
  branch?: string;
}

export interface Task {
  id: string;
  status?: string;
  metadata?: TaskMetadata;
  result?: TaskResult;
  createdAt?: string | Date | number;
  steps?: TaskStep[];
  error?: TaskError;
}

interface UseTasksPollingOptions {
  onAuthExpired?: () => void;
}

export function useTasksPolling({ onAuthExpired }: UseTasksPollingOptions = {}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const taskMapRef = useRef<Map<string, Task>>(new Map());

  const notifyAuthExpired = useCallback(() => {
    if (typeof onAuthExpired === 'function') {
      onAuthExpired();
    }
  }, [onAuthExpired]);

  const hasRunningTasks = useMemo(
    () => tasks.some((task) => task && (task.status === 'pending' || task.status === 'running')),
    [tasks],
  );

  useEffect(() => {
    const closeEventStream = createEventStream('/api/events', {
      onMessage(event) {
        if (event.type === 'task.created' || event.type === 'task.updated') {
          const task = event.data as Task;
          if (task && task.id) {
            taskMapRef.current.set(task.id, task);
            setTasks(Array.from(taskMapRef.current.values()));
          }
        }
      },
      onError(error) {
        console.error('Task stream error:', error);
        if (error && error.message && error.message.includes('401')) {
          notifyAuthExpired();
        }
      },
    });

    return () => {
      closeEventStream();
    };
  }, [notifyAuthExpired]);

  return {
    tasks,
    hasRunningTasks,
  };
}

