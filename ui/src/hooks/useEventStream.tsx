/**
 * Hook for managing real-time event stream connection
 */

import { useEffect, useRef, useState } from 'react';
import { createEventStream } from '../utils/eventStream.js';
import type { EventStreamCallbacks } from '../types/api.js';
import type { RepositoryData, Task, WorktreeSession } from '../types/domain.js';

type UseEventStreamOptions = EventStreamCallbacks;

function extractRepositoryData(payload: unknown): RepositoryData | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 1 && keys[0] === 'data' && 'data' in record) {
    const data = (record.data as RepositoryData | undefined) ?? null;
    return data && typeof data === 'object' ? data : null;
  }
  return record as RepositoryData;
}

function extractSessionsPayload(payload: unknown): { sessions: WorktreeSession[] } | null {
  if (
    payload &&
    typeof payload === 'object' &&
    Array.isArray((payload as { sessions?: unknown }).sessions)
  ) {
    return { sessions: (payload as { sessions: WorktreeSession[] }).sessions };
  }
  return null;
}

function extractTasks(payload: unknown): Task[] {
  if (Array.isArray(payload)) {
    return payload as Task[];
  }
  if (payload && typeof payload === 'object') {
    const { tasks, task } = payload as { tasks?: Task[]; task?: Task };
    if (Array.isArray(tasks)) {
      return tasks;
    }
    if (task) {
      return [task];
    }
  }
  return [];
}

export function useEventStream({
  onRepos,
  onSessions,
  onTasks,
  onConnect,
  onDisconnect,
}: UseEventStreamOptions = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const handlersRef = useRef<UseEventStreamOptions>({
    onRepos,
    onSessions,
    onTasks,
    onConnect,
    onDisconnect,
  });

  useEffect(() => {
    handlersRef.current = {
      onRepos,
      onSessions,
      onTasks,
      onConnect,
      onDisconnect,
    };
  }, [onRepos, onSessions, onTasks, onConnect, onDisconnect]);

  useEffect(() => {
    const stop = createEventStream({
      onRepos: (payload: unknown) => {
        const handler = handlersRef.current.onRepos;
        if (!handler) {
          return;
        }
        const repositories = extractRepositoryData(payload);
        if (repositories) {
          handler(repositories);
        }
      },
      onSessions: (payload: unknown) => {
        const handler = handlersRef.current.onSessions;
        if (!handler) {
          return;
        }
        const sessionsPayload = extractSessionsPayload(payload);
        if (sessionsPayload) {
          handler(sessionsPayload);
        }
      },
      onTasks: (payload: unknown) => {
        const handler = handlersRef.current.onTasks;
        if (!handler) {
          return;
        }
        const tasks = extractTasks(payload);
        if (tasks.length > 0) {
          handler(tasks);
        }
      },
      onConnect: () => {
        setIsConnected(true);
        const handler = handlersRef.current.onConnect;
        if (handler) {
          handler();
        }
      },
      onDisconnect: () => {
        setIsConnected(false);
        const handler = handlersRef.current.onDisconnect;
        if (handler) {
          handler();
        }
      },
    });

    return stop;
  }, []);

  return {
    isConnected,
  };
}
