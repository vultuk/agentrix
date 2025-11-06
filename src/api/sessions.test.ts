import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { createSessionHandlers } from './sessions.js';
import type { RequestContext } from '../types/http.js';
import type { SessionService } from '../services/session-service.js';

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const url = new URL('http://localhost/api/sessions');
  if (overrides.url) {
    Object.assign(url, overrides.url);
  }

  const headers = new Map<string, string | number | string[]>();
  const setHeader = mock.fn((name: string, value: string | number | string[]) => {
    headers.set(name.toLowerCase(), value);
  });
  const getHeader = mock.fn((name: string) => headers.get(name.toLowerCase()));

  return {
    req: { headers: {} } as unknown as RequestContext['req'],
    res: {
      statusCode: 0,
      setHeader,
      getHeader,
      end: mock.fn(),
    } as unknown as RequestContext['res'],
    url,
    method: 'GET',
    workdir: '/tmp/workdir',
    readJsonBody: async () => ({}),
    ...overrides,
  };
}

describe('createSessionHandlers', () => {
  it('list handler returns sessions', async () => {
    const sessionService = {
      listSessions: mock.fn(async () => [
        {
          org: 'vultuk',
          repo: 'agentrix',
          branch: 'main',
          idle: false,
          lastActivityAt: '2024-01-01T00:00:00.000Z',
        },
      ]),
    } as unknown as SessionService;

    const handlers = createSessionHandlers('/workdir', { sessionService });
    const context = createContext();

    await handlers.list(context);

    assert.equal(sessionService.listSessions.mock.calls.length, 1);
    assert.equal(context.res.statusCode, 200);
    const contentType = context.res.getHeader('Content-Type');
    const cacheControl = context.res.getHeader('Cache-Control');
    assert.equal(contentType, 'application/json; charset=utf-8');
    assert.equal(cacheControl, 'no-store');

    const endCall = (context.res.end as ReturnType<typeof mock.fn>).mock.calls[0];
    assert.ok(endCall);
    const body = JSON.parse(endCall.arguments[0] as string);
    assert.deepEqual(body, {
      sessions: [
        {
          org: 'vultuk',
          repo: 'agentrix',
          branch: 'main',
          idle: false,
          lastActivityAt: '2024-01-01T00:00:00.000Z',
        },
      ],
    });
  });

  it('list handler handles HEAD requests', async () => {
    const sessionService = {
      listSessions: mock.fn(async () => []),
    } as unknown as SessionService;

    const handlers = createSessionHandlers('/workdir', { sessionService });
    const context = createContext({ method: 'HEAD' });
    const end = context.res.end as ReturnType<typeof mock.fn>;

    await handlers.list(context);

    assert.equal(sessionService.listSessions.mock.calls.length, 0);
    assert.equal(context.res.statusCode, 200);
    const setHeaderCalls = (context.res.setHeader as ReturnType<typeof mock.fn>).mock.calls;
    assert.equal(
      setHeaderCalls.some((call) => call.arguments[0] === 'Cache-Control' && call.arguments[1] === 'no-store'),
      true
    );
    assert.equal(end.mock.calls.length, 1);
  });
});

