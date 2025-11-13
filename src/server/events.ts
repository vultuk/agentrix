import type { ServerResponse } from 'node:http';
import { discoverRepositories } from '../core/git.js';
import { listActiveSessions, serialiseSessions } from '../core/terminal-sessions.js';
import { loadPersistedSessionsSnapshot } from '../core/session-persistence.js';
import { getEventTypes, subscribeToEvents } from '../core/event-bus.js';
import { listTasks } from '../core/tasks.js';
import type { AuthManager } from '../types/auth.js';
import type { RequestContext } from '../types/http.js';
import { getRepositoryCacheSnapshot } from '../utils/repository-cache.js';

const HEARTBEAT_INTERVAL_MS = 15000;

interface EventData {
  event: string;
  data: unknown;
}

function writeEvent(res: ServerResponse, { event, data }: EventData): void {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.write(`event: ${event}\n`);
  res.write(`data: ${payload}\n\n`);
}

interface EventStreamDependencies {
  discoverRepositories: typeof discoverRepositories;
  listActiveSessions: typeof listActiveSessions;
  serialiseSessions: typeof serialiseSessions;
  loadPersistedSessionsSnapshot: typeof loadPersistedSessionsSnapshot;
  getEventTypes: typeof getEventTypes;
  subscribeToEvents: typeof subscribeToEvents;
  listTasks: typeof listTasks;
}

const defaultDependencies: EventStreamDependencies = {
  discoverRepositories,
  listActiveSessions,
  serialiseSessions,
  loadPersistedSessionsSnapshot,
  getEventTypes,
  subscribeToEvents,
  listTasks,
};

let testOverrides: Partial<EventStreamDependencies> | null = null;

export function __setEventStreamTestOverrides(
  overrides?: Partial<EventStreamDependencies>,
): void {
  testOverrides = overrides ?? null;
}

function getDependency<K extends keyof EventStreamDependencies>(key: K): EventStreamDependencies[K] {
  return (testOverrides?.[key] ?? defaultDependencies[key]) as EventStreamDependencies[K];
}

async function sendInitialSnapshots(res: ServerResponse, workdir: string): Promise<void> {
  const eventTypes = getDependency('getEventTypes')();
  const cachedRepos = getRepositoryCacheSnapshot();
  const [reposSnapshot, rawSessionsSnapshot, tasksSnapshot] = await Promise.all([
    cachedRepos ? Promise.resolve(cachedRepos) : getDependency('discoverRepositories')(workdir).catch(() => ({})),
    Promise.resolve(getDependency('serialiseSessions')(getDependency('listActiveSessions')())),
    Promise.resolve(getDependency('listTasks')()).catch(() => []),
  ]);
  const sessionsSnapshot =
    Array.isArray(rawSessionsSnapshot) && rawSessionsSnapshot.length > 0
      ? rawSessionsSnapshot
      : await getDependency('loadPersistedSessionsSnapshot')().catch(() => []);

  writeEvent(res, { event: eventTypes.REPOS_UPDATE, data: { data: reposSnapshot } });
  writeEvent(res, { event: eventTypes.SESSIONS_UPDATE, data: { sessions: sessionsSnapshot } });
  if (Array.isArray(tasksSnapshot) && tasksSnapshot.length > 0) {
    writeEvent(res, { event: eventTypes.TASKS_UPDATE, data: { tasks: tasksSnapshot } });
  }
}

export interface EventStreamConfig {
  authManager: AuthManager;
  workdir: string;
}

export function createEventStreamHandler({ authManager, workdir }: EventStreamConfig) {
  if (!authManager) {
    throw new Error('authManager is required');
  }
  if (!workdir) {
    throw new Error('workdir is required');
  }

  return async function handleEventStream(context: RequestContext): Promise<void> {
    const { res, req } = context;

    if (!authManager.isAuthenticated(req)) {
      res.statusCode = 401;
      res.end();
      return;
    }

    res.writeHead(200, {
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream',
      'X-Accel-Buffering': 'no',
    });

    res.write(': connected\n\n');

    const cleanupFunctions: Array<() => void> = [];

    const heartbeatInterval = setInterval(() => {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeatInterval);
      }
    }, HEARTBEAT_INTERVAL_MS);
    cleanupFunctions.push(() => clearInterval(heartbeatInterval));

    const eventTypes = getDependency('getEventTypes')();
    const unsubscribeRepos = getDependency('subscribeToEvents')(eventTypes.REPOS_UPDATE, (payload) => {
      try {
        writeEvent(res, { event: eventTypes.REPOS_UPDATE, data: { data: payload } });
      } catch {
        res.end();
      }
    });
    cleanupFunctions.push(unsubscribeRepos);

    const unsubscribeSessions = getDependency('subscribeToEvents')(eventTypes.SESSIONS_UPDATE, (payload) => {
      try {
        writeEvent(res, {
          event: eventTypes.SESSIONS_UPDATE,
          data: { sessions: payload },
        });
      } catch {
        res.end();
      }
    });
    cleanupFunctions.push(unsubscribeSessions);

    const unsubscribeTasks = getDependency('subscribeToEvents')(eventTypes.TASKS_UPDATE, (payload) => {
      try {
        writeEvent(res, {
          event: eventTypes.TASKS_UPDATE,
          data: payload,
        });
      } catch {
        res.end();
      }
    });
    cleanupFunctions.push(unsubscribeTasks);

    req.on('close', () => {
      cleanupFunctions.forEach((fn) => {
        try {
          fn();
        } catch {
          // ignore cleanup errors
        }
      });
    });

    try {
      await sendInitialSnapshots(res, workdir);
    } catch (error: unknown) {
      const err = error as { message?: string };
      try {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ error: err?.message || 'Failed to stream events' })}\n\n`);
      } catch {
        // ignore secondary failures
      }
      res.end();
    }
  };
}
