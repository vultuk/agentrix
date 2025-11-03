import { discoverRepositories } from '../core/git.js';
import { listActiveSessions } from '../core/terminal-sessions.js';
import { getEventTypes, subscribeToEvents } from '../core/event-bus.js';
import { listTasks } from '../core/tasks.js';

const HEARTBEAT_INTERVAL_MS = 15000;

function writeEvent(res, { event, data }) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  res.write(`event: ${event}\n`);
  res.write(`data: ${payload}\n\n`);
}

async function sendInitialSnapshots(res, workdir) {
  const [reposSnapshot, sessionsSnapshot, tasksSnapshot] = await Promise.all([
    discoverRepositories(workdir).catch(() => ({})),
    Promise.resolve(listActiveSessions()).then((sessions) =>
      sessions.map((session) => {
        const lastActivityAtMs =
          typeof session.lastActivityAt === 'number'
            ? session.lastActivityAt
            : session.lastActivityAt instanceof Date
            ? session.lastActivityAt.getTime()
            : null;
        return {
          id: session.id,
          org: session.org,
          repo: session.repo,
          branch: session.branch,
          usingTmux: session.usingTmux,
          idle: Boolean(session.idle),
          lastActivityAt: lastActivityAtMs ? new Date(lastActivityAtMs).toISOString() : null,
        };
      }),
    ),
    Promise.resolve(listTasks()).catch(() => []),
  ]);

  writeEvent(res, { event: getEventTypes().REPOS_UPDATE, data: { data: reposSnapshot } });
  writeEvent(res, { event: getEventTypes().SESSIONS_UPDATE, data: { sessions: sessionsSnapshot } });
  if (Array.isArray(tasksSnapshot) && tasksSnapshot.length > 0) {
    writeEvent(res, { event: getEventTypes().TASKS_UPDATE, data: { tasks: tasksSnapshot } });
  }
}

export function createEventStreamHandler({ authManager, workdir }) {
  if (!authManager) {
    throw new Error('authManager is required');
  }
  if (!workdir) {
    throw new Error('workdir is required');
  }

  return async function handleEventStream(context) {
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

    const cleanupFunctions = [];

    const heartbeatInterval = setInterval(() => {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeatInterval);
      }
    }, HEARTBEAT_INTERVAL_MS);
    cleanupFunctions.push(() => clearInterval(heartbeatInterval));

    const unsubscribeRepos = subscribeToEvents(getEventTypes().REPOS_UPDATE, (payload) => {
      try {
        writeEvent(res, { event: getEventTypes().REPOS_UPDATE, data: { data: payload } });
      } catch {
        res.end();
      }
    });
    cleanupFunctions.push(unsubscribeRepos);

    const unsubscribeSessions = subscribeToEvents(getEventTypes().SESSIONS_UPDATE, (payload) => {
      try {
        writeEvent(res, {
          event: getEventTypes().SESSIONS_UPDATE,
          data: { sessions: payload },
        });
      } catch {
        res.end();
      }
    });
    cleanupFunctions.push(unsubscribeSessions);

    const unsubscribeTasks = subscribeToEvents(getEventTypes().TASKS_UPDATE, (payload) => {
      try {
        writeEvent(res, {
          event: getEventTypes().TASKS_UPDATE,
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
    } catch (error) {
      try {
        res.write(`event: error\n`);
        res.write(`data: ${JSON.stringify({ error: error?.message || 'Failed to stream events' })}\n\n`);
      } catch {
        // ignore secondary failures
      }
      res.end();
    }
  };
}
