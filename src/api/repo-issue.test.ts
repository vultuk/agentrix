import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { createRepoIssueHandlers } from './repo-issue.js';
import { __setBaseHandlerTestOverrides } from './base-handler.js';
import type { RequestContext } from '../types/http.js';

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const url = new URL('http://localhost/api/repo-issue?org=vultuk&repo=agentrix&issue=123');
  if (overrides.url) {
    Object.assign(url, overrides.url);
  }
  return {
    req: { headers: {} } as unknown as RequestContext['req'],
    res: {
      statusCode: 0,
      setHeader: mock.fn(),
      getHeader: mock.fn(),
      end: mock.fn(),
    } as unknown as RequestContext['res'],
    url,
    method: 'GET',
    workdir: '/tmp/workdir',
    readJsonBody: async () => ({}),
    ...overrides,
  };
}

describe('createRepoIssueHandlers', () => {
  it('read handler returns issue data', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const ensureRepo = mock.fn(async () => ({ repositoryPath: '/repo/path' }));
    const githubClient = {
      getIssue: mock.fn(async () => ({
        number: 123,
        title: 'Test Issue',
        body: 'Issue description',
      })),
    };
    const now = mock.fn(() => new Date('2024-01-01T00:00:00Z'));

    const handlers = createRepoIssueHandlers('/workdir', {
      ensureRepo,
      githubClient,
      now,
    });

    const context = createContext();

    await handlers.read(context);
    __setBaseHandlerTestOverrides();

    assert.equal(ensureRepo.mock.calls.length, 1);
    assert.deepEqual(ensureRepo.mock.calls[0]?.arguments, ['/workdir', 'vultuk', 'agentrix']);

    assert.equal(githubClient.getIssue.mock.calls.length, 1);
    assert.deepEqual(githubClient.getIssue.mock.calls[0]?.arguments, ['vultuk', 'agentrix', 123]);

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    const response = call.arguments[2] as { data: unknown };
    assert.ok(response.data);
    assert.equal((response.data as { org: string }).org, 'vultuk');
    assert.equal((response.data as { repo: string }).repo, 'agentrix');
    assert.equal((response.data as { fetchedAt: string }).fetchedAt, '2024-01-01T00:00:00.000Z');
    assert.equal((response.data as { issue: { number: number } }).issue.number, 123);
  });

  it('requires issue parameter', async () => {
    __setBaseHandlerTestOverrides();

    const handlers = createRepoIssueHandlers('/workdir');
    const url = new URL('http://localhost/api/repo-issue?org=vultuk&repo=agentrix');
    const context = createContext({ url });

    await handlers.read(context);
    __setBaseHandlerTestOverrides();

    // ValidationError is thrown and handled by asyncHandler -> handleError (uses real sendJson)
    assert.equal(context.res.statusCode, 400);
    const endCalls = (context.res.end as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok(endCalls.length > 0);
    // Find the call with JSON error body (handleError sends this)
    const errorCall = endCalls.find((call) => {
      const arg = call.arguments[0];
      return typeof arg === 'string' && arg.includes('error');
    });
    assert.ok(errorCall);
    const body = JSON.parse(errorCall.arguments[0] as string);
    assert.deepEqual(body, { error: 'issue query parameter is required' });
  });

  it('validates issue parameter is a positive integer', async () => {
    __setBaseHandlerTestOverrides();

    const handlers = createRepoIssueHandlers('/workdir');
    const url = new URL('http://localhost/api/repo-issue?org=vultuk&repo=agentrix&issue=-5');
    const context = createContext({ url });

    await handlers.read(context);
    __setBaseHandlerTestOverrides();

    // ValidationError is thrown and handled by asyncHandler -> handleError (uses real sendJson)
    assert.equal(context.res.statusCode, 400);
    const endCalls = (context.res.end as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok(endCalls.length > 0);
    // Find the call with JSON error body (handleError sends this)
    const errorCall = endCalls.find((call) => {
      const arg = call.arguments[0];
      return typeof arg === 'string' && arg.includes('error');
    });
    assert.ok(errorCall);
    const body = JSON.parse(errorCall.arguments[0] as string);
    assert.deepEqual(body, { error: 'issue query parameter must be a positive integer' });
  });

  it('validates issue parameter is not NaN', async () => {
    __setBaseHandlerTestOverrides();

    const handlers = createRepoIssueHandlers('/workdir');
    const url = new URL('http://localhost/api/repo-issue?org=vultuk&repo=agentrix&issue=abc');
    const context = createContext({ url });

    await handlers.read(context);
    __setBaseHandlerTestOverrides();

    // ValidationError is thrown and handled by asyncHandler -> handleError (uses real sendJson)
    assert.equal(context.res.statusCode, 400);
    const endCalls = (context.res.end as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok(endCalls.length > 0);
    // Find the call with JSON error body (handleError sends this)
    const errorCall = endCalls.find((call) => {
      const arg = call.arguments[0];
      return typeof arg === 'string' && arg.includes('error');
    });
    assert.ok(errorCall);
    const body = JSON.parse(errorCall.arguments[0] as string);
    assert.deepEqual(body, { error: 'issue query parameter must be a positive integer' });
  });

  it('handles repository not found errors', async () => {
    __setBaseHandlerTestOverrides();

    const ensureRepo = mock.fn(async () => {
      throw new Error('Repository not found');
    });

    const handlers = createRepoIssueHandlers('/workdir', {
      ensureRepo,
    });

    const context = createContext();

    await handlers.read(context);
    __setBaseHandlerTestOverrides();

    // HttpError is thrown and handled by asyncHandler -> handleError (uses real sendJson)
    assert.equal(context.res.statusCode, 404);
    const endCalls = (context.res.end as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok(endCalls.length > 0);
    // Find the call with JSON error body (handleError sends this)
    const errorCall = endCalls.find((call) => {
      const arg = call.arguments[0];
      return typeof arg === 'string' && arg.includes('error');
    });
    assert.ok(errorCall);
    const body = JSON.parse(errorCall.arguments[0] as string);
    assert.deepEqual(body, { error: 'Repository not found' });
  });

  it('handles HEAD requests', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const ensureRepo = mock.fn(async () => ({ repositoryPath: '/repo/path' }));
    const handlers = createRepoIssueHandlers('/workdir', { ensureRepo });

    const context = createContext({ method: 'HEAD' });
    const setHeader = context.res.setHeader as ReturnType<typeof mock.fn>;
    const end = context.res.end as ReturnType<typeof mock.fn>;

    await handlers.read(context);
    __setBaseHandlerTestOverrides();

    // handleHeadRequest is called directly, then createQueryHandler may also send response
    // Check that HEAD was handled (status code set, cache control header set)
    assert.equal(context.res.statusCode, 200);
    assert.equal(setHeader.mock.calls.some((call) => call?.arguments[0] === 'Cache-Control'), true);
    // Should have called end (either from handleHeadRequest or createQueryHandler)
    assert.equal(end.mock.calls.length, 1);
  });
});

