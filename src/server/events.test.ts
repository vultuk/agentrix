import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';

import { createEventStreamHandler, __setEventStreamTestOverrides } from './events.js';
import type { AuthManager } from '../types/auth.js';
import type { RequestContext } from '../types/http.js';

function createAuthManager(isAuthenticated: boolean): AuthManager {
  return {
    isAuthenticated: mock.fn(() => isAuthenticated),
    addToken: mock.fn(),
    clear: mock.fn(),
    hasToken: mock.fn(),
    removeToken: mock.fn(),
    verifyToken: mock.fn(),
    createSessionCookie: mock.fn(),
  };
}

function createContext(): RequestContext & { writes: string[]; close: () => void } {
  let closeHandler: (() => void) | null = null;
  const writes: string[] = [];
  const req = {
    headers: {},
    on: mock.fn((event: string, handler: () => void) => {
      if (event === 'close') {
        closeHandler = handler;
      }
    }),
  } as unknown as RequestContext['req'];
  const res = {
    statusCode: 0,
    writeHead: mock.fn(),
    setHeader: mock.fn(),
    write: mock.fn((chunk: string) => {
      writes.push(chunk);
    }),
    end: mock.fn(),
  } as unknown as RequestContext['res'];
  const url = new URL('http://localhost/api/events');
  return {
    req,
    res,
    url,
    method: 'GET',
    workdir: '/workdir',
    readJsonBody: async () => ({}),
    writes,
    close: () => closeHandler?.(),
  };
}

describe('createEventStreamHandler', () => {
  beforeEach(() => {
    __setEventStreamTestOverrides({
      getEventTypes: () => ({
        REPOS_UPDATE: 'repos:update',
        SESSIONS_UPDATE: 'sessions:update',
        TASKS_UPDATE: 'tasks:update',
      }),
      discoverRepositories: async () => ({ org: { repo: {} } }),
      listActiveSessions: () => [
        {
          id: 'session-1',
          org: 'org',
          repo: 'repo',
          branch: 'main',
          usingTmux: false,
          idle: false,
          lastActivityAt: new Date('2024-01-01T00:00:00Z'),
        },
      ],
      listTasks: () => [
        { id: 'task-1', status: 'running' },
      ],
      loadPersistedSessionsSnapshot: async () => [],
      subscribeToEvents: (event: string, handler: (payload: unknown) => void) => {
        subscriptionHandlers.set(event, handler);
        return () => {
          unsubscribedEvents.push(event);
        };
      },
    });
  });

  afterEach(() => {
    __setEventStreamTestOverrides();
    subscriptionHandlers.clear();
    unsubscribedEvents.length = 0;
  });

  const subscriptionHandlers = new Map<string, (payload: unknown) => void>();
  const unsubscribedEvents: string[] = [];

  it('rejects unauthenticated requests', async () => {
    const handler = createEventStreamHandler({
      authManager: createAuthManager(false),
      workdir: '/workdir',
    });
    const context = createContext();

    await handler(context);

    assert.equal(context.res.statusCode, 401);
    assert.equal((context.res.end as ReturnType<typeof mock.fn>).mock.calls.length, 1);
    assert.deepEqual(context.writes, []);
  });

  it('streams initial snapshots and registers subscriptions', async () => {
    const handler = createEventStreamHandler({
      authManager: createAuthManager(true),
      workdir: '/workdir',
    });
    const context = createContext();

    await handler(context);
    context.close();

    const writeHeadCall = (context.res.writeHead as ReturnType<typeof mock.fn>).mock.calls[0];
    assert.ok(writeHeadCall);
    assert.equal(writeHeadCall.arguments[0], 200);

    assert.equal(context.writes[0], ': connected\n\n');
    const reposEvent = context.writes.find((chunk) => chunk.startsWith('event: repos:update'));
    assert.ok(reposEvent);
    const sessionsEvent = context.writes.find((chunk) => chunk.startsWith('event: sessions:update'));
    assert.ok(sessionsEvent);
    const tasksEvent = context.writes.find((chunk) => chunk.startsWith('event: tasks:update'));
    assert.ok(tasksEvent);

    assert.equal(subscriptionHandlers.size, 3);
    assert.equal(unsubscribedEvents.length, 3);
    assert.ok(unsubscribedEvents.includes('repos:update'));
    assert.ok(unsubscribedEvents.includes('sessions:update'));
    assert.ok(unsubscribedEvents.includes('tasks:update'));
  });

  it('emits error event when initial snapshot fails', async () => {
    const writeMock = mock.fn((chunk: string) => {
      if (chunk.startsWith('event: repos:update')) {
        throw new Error('write failure');
      }
    });
    __setEventStreamTestOverrides({
      getEventTypes: () => ({
        REPOS_UPDATE: 'repos:update',
        SESSIONS_UPDATE: 'sessions:update',
        TASKS_UPDATE: 'tasks:update',
      }),
      discoverRepositories: async () => ({ ok: true }),
      listActiveSessions: () => [],
      listTasks: () => [],
      loadPersistedSessionsSnapshot: async () => [],
      subscribeToEvents: () => () => {},
    });

    const handler = createEventStreamHandler({
      authManager: createAuthManager(true),
      workdir: '/workdir',
    });
    const context = createContext();
    context.res.write = writeMock as never;

    await handler(context);
    context.close();

    assert.equal(
      writeMock.mock.calls.some((call) => String(call?.arguments[0]).startsWith('event: error')),
      true,
    );
    assert.equal((context.res.end as ReturnType<typeof mock.fn>).mock.calls.length > 0, true);
  });
});
