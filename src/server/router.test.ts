import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';

import { createRouter, __setRouterTestOverrides } from './router.js';
import type { RouterConfig } from './router.js';
import type { AuthManager } from '../types/auth.js';

function createReq(url: string, method: string): { req: { url: string; method: string; headers: Record<string, string> } } {
  return {
    req: {
      url,
      method,
      headers: { host: 'localhost' },
    },
  };
}

function createRes() {
  const headers = new Map<string, string>();
  return {
    res: {
      statusCode: 0,
      setHeader: mock.fn((name: string, value: string) => {
        headers.set(name.toLowerCase(), value);
      }),
      getHeader: (name: string) => headers.get(name.toLowerCase()),
      end: mock.fn(),
    },
  };
}

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

function createStubHandlers() {
  return {
    createAuthHandlers: () => ({
      login: async () => {},
      logout: async () => {},
      status: async () => {},
    }),
    createAutomationHandlers: () => ({
      launch: async () => {},
    }),
    createRepoHandlers: () => ({
      list: async () => {},
      create: async () => {},
      delete: async () => {},
      updateInitCommand: async () => {},
    }),
    createRepoDashboardHandlers: () => ({
      read: async () => {},
    }),
    createRepoIssueHandlers: () => ({
      read: async () => {},
    }),
    createSessionHandlers: () => ({
      list: async () => {},
    }),
    createWorktreeHandlers: () => ({
      create: async () => {},
      delete: async () => {},
    }),
    createTerminalHandlers: () => ({
      open: async () => {},
      send: async () => {},
      close: async () => {},
    }),
    createConfigHandlers: () => ({
      commands: async () => {},
    }),
    createPlanHandlers: () => ({
      create: async () => {},
    }),
    createGitStatusHandlers: () => ({
      read: async () => {},
      diff: async () => {},
    }),
    createPlanArtifactHandlers: () => ({
      list: async () => {},
      read: async () => {},
    }),
    createEventStreamHandler: () => async () => {},
    createTaskHandlers: () => ({
      list: async () => {},
      read: async () => {},
    }),
    createPortHandlers: () => ({
      list: async () => {},
      openTunnel: async () => {},
    }),
    sendJson: (res: unknown, statusCode: number, payload: unknown) => {
      const response = res as { statusCode: number; end: (value?: unknown) => void };
      response.statusCode = statusCode;
      response.end(JSON.stringify(payload));
    },
    readJsonBody: async () => ({}),
  };
}

describe('createRouter', () => {
  const portManagerStub = {
    open: async () => ({ port: 0, url: '', createdAt: 0 }),
    close: async () => {},
    closeAll: async () => {},
    list: () => [],
  };

  beforeEach(() => {
    __setRouterTestOverrides(createStubHandlers());
  });

  afterEach(() => {
    __setRouterTestOverrides();
  });

  it('throws when auth manager missing', () => {
    const config = {
      workdir: '/workdir',
      agentCommands: {},
      portManager: portManagerStub,
    } as RouterConfig;
    assert.throws(() => createRouter(config), { message: 'authManager is required' });
  });

  it('rejects unauthenticated requests for protected routes', async () => {
    const authManager = createAuthManager(false);
    const router = createRouter({
      authManager,
      workdir: '/repo',
      agentCommands: {},
      portManager: portManagerStub,
    });

    const { req } = createReq('/api/repos', 'GET');
    const { res } = createRes();

    const handled = await router(req as never, res as never);

    assert.equal(handled, true);
    assert.equal(res.statusCode, 401);
    const endCall = (res.end as ReturnType<typeof mock.fn>).mock.calls[0];
    assert.ok(endCall);
    const payload = JSON.parse(endCall.arguments[0] as string);
    assert.equal(payload.error, 'Authentication required');
  });

  it('returns 405 with Allow header when method not supported', async () => {
    const authManager = createAuthManager(true);
    const router = createRouter({
      authManager,
      workdir: '/repo',
      agentCommands: {},
      portManager: portManagerStub,
    });

    const { req } = createReq('/api/repos', 'PUT');
    const { res } = createRes();

    const handled = await router(req as never, res as never);

    assert.equal(handled, true);
    assert.equal(res.statusCode, 405);
    const setHeaderCalls = res.setHeader as ReturnType<typeof mock.fn>;
    assert.equal(
      setHeaderCalls.mock.calls.some(
        (call) => call?.arguments[0] === 'Allow' && call?.arguments[1] === 'GET, HEAD, POST, DELETE',
      ),
      true,
    );
    const endCall = (res.end as ReturnType<typeof mock.fn>).mock.calls[0];
    assert.ok(endCall);
    assert.equal(endCall.arguments[0], 'Method Not Allowed');
  });

  it('routes task detail requests and injects context helpers', async () => {
    const authManager = createAuthManager(true);
    const readCallArgs: unknown[] = [];
    const overrides = createStubHandlers();
    overrides.createTaskHandlers = () => ({
      list: async () => {},
      read: async (context: unknown, taskId: string) => {
        readCallArgs.push(context, taskId);
      },
    });
    const readJsonCalls: unknown[] = [];
    overrides.readJsonBody = async (req: unknown) => {
      readJsonCalls.push(req);
      return { ok: true };
    };
    __setRouterTestOverrides(overrides);

    const router = createRouter({
      authManager,
      workdir: '/repo',
      agentCommands: {},
      portManager: portManagerStub,
    });

    const { req } = createReq('/api/tasks/task-123', 'get');
    const { res } = createRes();

    const handled = await router(req as never, res as never);

    assert.equal(handled, true);
    assert.equal(readCallArgs.length, 2);
    const context = readCallArgs[0] as { params: { id: string }; readJsonBody: () => Promise<unknown> };
    assert.equal(context.params.id, 'task-123');
    assert.deepEqual(await context.readJsonBody(), { ok: true });
    assert.equal(readCallArgs[1], 'task-123');
    assert.equal(readJsonCalls.includes(req), true);
  });

  it('returns false for unknown routes', async () => {
    const authManager = createAuthManager(true);
    const router = createRouter({
      authManager,
      workdir: '/repo',
      agentCommands: {},
      portManager: portManagerStub,
    });

    const { req } = createReq('/unknown', 'GET');
    const { res } = createRes();

    const handled = await router(req as never, res as never);

    assert.equal(handled, false);
    assert.equal(res.statusCode, 0);
    assert.equal((res.end as ReturnType<typeof mock.fn>).mock.calls.length, 0);
  });
});
