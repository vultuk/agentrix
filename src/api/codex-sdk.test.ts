import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import type { RequestContext } from '../types/http.js';
import type { CodexSdkService } from '../services/codex-sdk-service.js';
import { createCodexSdkHandlers } from './codex-sdk.js';

function createResponse() {
  const headers = new Map<string, string>();
  return {
    statusCode: 0,
    setHeader: mock.fn((key: string, value: string) => {
      headers.set(key, value);
    }),
    getHeader: mock.fn((key: string) => headers.get(key)),
    end: mock.fn(),
  };
}

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const url = new URL('http://localhost/api/codex-sdk/sessions');
  const res = createResponse();
  return {
    req: { headers: {} } as never,
    res: res as never,
    url,
    method: 'GET',
    workdir: '/workdir',
    readJsonBody: async () => ({}),
    params: {},
    ...overrides,
  };
}

function parseResponseBody(res: { end: ReturnType<typeof mock.fn> }) {
  const payload = res.end.mock.calls[0]?.arguments[0];
  return typeof payload === 'string' && payload.length > 0 ? JSON.parse(payload) : null;
}

describe('createCodexSdkHandlers', () => {
  it('lists Codex sessions for a worktree', async () => {
    const codexSdkService = {
      listSessions: mock.fn(async () => [
        { id: 'sdk-1', org: 'acme', repo: 'demo', branch: 'main', label: 'Default', createdAt: 't1', lastActivityAt: null },
      ]),
    } as unknown as CodexSdkService;
    const handlers = createCodexSdkHandlers('/workdir', { codexSdkService });
    const res = createResponse();
    const context = createContext({
      res: res as never,
      url: new URL('http://localhost/api/codex-sdk/sessions?org=acme&repo=demo&branch=main'),
      method: 'GET',
    });

    await handlers.listSessions(context);

    assert.equal(codexSdkService.listSessions.mock.callCount(), 1);
    assert.deepEqual(codexSdkService.listSessions.mock.calls[0]?.arguments[0], {
      org: 'acme',
      repo: 'demo',
      branch: 'main',
    });
    const body = parseResponseBody(res);
    assert.deepEqual(body, {
      sessions: [
        { id: 'sdk-1', org: 'acme', repo: 'demo', branch: 'main', label: 'Default', createdAt: 't1', lastActivityAt: null },
      ],
    });
  });

  it('creates a Codex session via the service', async () => {
    const codexSdkService = {
      createSession: mock.fn(async () => ({
        session: { id: 'sdk-2', org: 'acme', repo: 'demo', branch: 'dev', label: 'New', createdAt: 't2', lastActivityAt: null },
        events: [],
      })),
    } as unknown as CodexSdkService;
    const handlers = createCodexSdkHandlers('/workdir', { codexSdkService });
    const res = createResponse();
    const context = createContext({
      res: res as never,
      method: 'POST',
      readJsonBody: async () => ({ org: 'acme', repo: 'demo', branch: 'dev', label: 'New' }),
    });

    await handlers.createSession(context);

    assert.equal(codexSdkService.createSession.mock.callCount(), 1);
    assert.deepEqual(codexSdkService.createSession.mock.calls[0]?.arguments[0], {
      org: 'acme',
      repo: 'demo',
      branch: 'dev',
      label: 'New',
    });
    const body = parseResponseBody(res);
    assert.deepEqual(body, {
      session: { id: 'sdk-2', org: 'acme', repo: 'demo', branch: 'dev', label: 'New', createdAt: 't2', lastActivityAt: null },
      events: [],
    });
  });

  it('reads Codex session details by id', async () => {
    const codexSdkService = {
      getSession: mock.fn(async () => ({
        session: { id: 'sdk-3', org: 'acme', repo: 'demo', branch: 'main', label: 'Existing', createdAt: 't3', lastActivityAt: null },
        events: [{ type: 'ready', message: 'ready', timestamp: 't3' }],
      })),
    } as unknown as CodexSdkService;
    const handlers = createCodexSdkHandlers('/workdir', { codexSdkService });
    const res = createResponse();
    const context = createContext({
      res: res as never,
      method: 'GET',
      params: { id: 'sdk-3' },
      url: new URL('http://localhost/api/codex-sdk/sessions/sdk-3'),
    });

    await handlers.readSession(context);

    assert.equal(codexSdkService.getSession.mock.callCount(), 1);
    assert.equal(codexSdkService.getSession.mock.calls[0]?.arguments[0], 'sdk-3');
    const body = parseResponseBody(res);
    assert.deepEqual(body, {
      session: { id: 'sdk-3', org: 'acme', repo: 'demo', branch: 'main', label: 'Existing', createdAt: 't3', lastActivityAt: null },
      events: [{ type: 'ready', message: 'ready', timestamp: 't3' }],
    });
  });

  it('returns a not found error when a Codex session is missing', async () => {
    const codexSdkService = {
      getSession: mock.fn(async () => null),
    } as unknown as CodexSdkService;
    const handlers = createCodexSdkHandlers('/workdir', { codexSdkService });
    const res = createResponse();
    const context = createContext({
      res: res as never,
      method: 'GET',
      params: { id: 'missing' },
      url: new URL('http://localhost/api/codex-sdk/sessions/missing'),
    });

    await handlers.readSession(context);
    assert.equal(codexSdkService.getSession.mock.callCount(), 1);
    assert.equal(res.statusCode, 404);
    const body = parseResponseBody(res);
    assert.ok(body);
    assert.match(String(body.error), /Codex session not found/i);
  });

  it('deletes Codex sessions', async () => {
    const codexSdkService = {
      deleteSession: mock.fn(async () => {}),
    } as unknown as CodexSdkService;
    const handlers = createCodexSdkHandlers('/workdir', { codexSdkService });
    const res = createResponse();
    const context = createContext({
      res: res as never,
      method: 'DELETE',
      params: { id: 'sdk-4' },
      url: new URL('http://localhost/api/codex-sdk/sessions/sdk-4'),
    });

    await handlers.deleteSession(context);
    assert.equal(codexSdkService.deleteSession.mock.callCount(), 1);
    assert.equal(codexSdkService.deleteSession.mock.calls[0]?.arguments[0], 'sdk-4');
    const body = parseResponseBody(res);
    assert.deepEqual(body, { ok: true });
  });
});
