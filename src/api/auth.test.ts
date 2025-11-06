import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import type { RequestContext } from '../types/http.js';
import { __setBaseHandlerTestOverrides } from './base-handler.js';
import { __setAuthTestOverrides, createAuthHandlers } from './auth.js';

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const headers = new Map<string, unknown>();
  const res = {
    statusCode: 0,
    setHeader: (name: string, value: unknown) => {
      headers.set(name.toLowerCase(), value);
    },
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    end: () => {
      /* no-op */
    },
  } as unknown as RequestContext['res'];

  return {
    req: { headers: {} } as unknown as RequestContext['req'],
    res,
    url: new URL('http://localhost/api/auth'),
    method: 'POST',
    workdir: '/tmp/workdir',
    readJsonBody: async () => ({}),
    ...overrides,
  };
}

function setupOverrides(serviceOverrides: Partial<Record<'login' | 'logout' | 'getStatus', unknown>> = {}) {
  const sendJson = mock.fn();
  const service = {
    login: mock.fn(async () => ({ ok: true })),
    logout: mock.fn(async () => ({ loggedOut: true })),
    getStatus: mock.fn(async () => ({ active: false })),
    ...serviceOverrides,
  } as {
    login: (...args: unknown[]) => Promise<unknown>;
    logout: (...args: unknown[]) => Promise<unknown>;
    getStatus: (...args: unknown[]) => Promise<unknown>;
  };

  const createAuthService = mock.fn(() => service);

  __setAuthTestOverrides({
    createAuthService,
    sendJson,
  });

  return { sendJson, service, createAuthService };
}

describe('createAuthHandlers', () => {
  it('creates handlers wired to auth service', async () => {
    const { createAuthService, sendJson, service } = setupOverrides();

    const authManager = { hash: 'manager' } as never;
    const cookieManager = { get: () => '' } as never;

    const handlers = createAuthHandlers(authManager, { cookieManager });

    assert.equal(typeof handlers.login, 'function');
    assert.equal(typeof handlers.logout, 'function');
    assert.equal(typeof handlers.status, 'function');
    assert.equal(createAuthService.mock.calls.length, 1);
    assert.strictEqual(createAuthService.mock.calls[0]?.arguments[0], authManager);
    assert.strictEqual(createAuthService.mock.calls[0]?.arguments[1], cookieManager);

    const context = createContext({
      readJsonBody: async () => ({ password: ' secret ' }),
    });

    await handlers.login(context);
    await handlers.logout(createContext());
    await handlers.status(createContext());
    __setAuthTestOverrides();

    assert.equal(service.login.mock.calls.length, 1);
    assert.equal(service.logout.mock.calls.length, 1);
    assert.equal(service.getStatus.mock.calls.length, 1);
    assert.equal(sendJson.mock.calls.length, 1);
  });

  it('returns 401 for invalid password errors', async () => {
    const loginError = new Error('Invalid password');
    const { service, sendJson } = setupOverrides({
      login: mock.fn(async () => {
        throw loginError;
      }),
    });

    const handlers = createAuthHandlers({} as never);

    const context = createContext({
      readJsonBody: async () => ({ password: 'bad' }),
    });

    await handlers.login(context);
    __setAuthTestOverrides();

    assert.equal(service.login.mock.calls.length, 1);
    const call = sendJson.mock.calls.at(-1);
    assert.ok(call);
    assert.equal(call.arguments[1], 401);
    assert.deepEqual(call.arguments[2], { error: 'Invalid password' });
  });

  it('propagates status codes from thrown errors', async () => {
    const error = { statusCode: 418, message: 'Nope' };
    const { service, sendJson } = setupOverrides({
      login: mock.fn(async () => {
        throw error;
      }),
    });

    const handlers = createAuthHandlers({} as never);

    const context = createContext({
      readJsonBody: async () => ({ password: 'bad' }),
    });

    await handlers.login(context);
    __setAuthTestOverrides();

    assert.equal(service.login.mock.calls.length, 1);
    const call = sendJson.mock.calls.at(-1);
    assert.ok(call);
    assert.equal(call.arguments[1], 418);
    assert.deepEqual(call.arguments[2], { error: 'Nope' });
  });

  it('sends logout and status responses through sendJson', async () => {
    const { service, sendJson } = setupOverrides({
      logout: mock.fn(async () => ({ loggedOut: true })),
      getStatus: mock.fn(async () => ({ active: true })),
    });

    const handlers = createAuthHandlers({} as never);

    __setBaseHandlerTestOverrides({ sendJson });

    const readJsonBody = mock.fn(async () => ({}));
    const logoutContext = createContext({ readJsonBody });
    const statusContext = createContext();

    await handlers.logout(logoutContext);
    await handlers.status(statusContext);
    __setAuthTestOverrides();
    __setBaseHandlerTestOverrides();

    assert.equal(service.logout.mock.calls.length, 1);
    assert.equal(service.getStatus.mock.calls.length, 1);
    assert.equal(readJsonBody.mock.calls.length, 0);

    const [logoutCall, statusCall] = sendJson.mock.calls.slice(-2);
    assert.ok(logoutCall && statusCall);
    assert.equal(logoutCall.arguments[1], 200);
    assert.deepEqual(logoutCall.arguments[2], { loggedOut: true });
    assert.equal(statusCall.arguments[1], 200);
    assert.deepEqual(statusCall.arguments[2], { active: true });
  });
});

