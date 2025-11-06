import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { createRepoDashboardHandlers } from './repo-dashboard.js';
import { __setBaseHandlerTestOverrides } from './base-handler.js';
import type { RequestContext } from '../types/http.js';

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const url = new URL('http://localhost/api/repo-dashboard?org=vultuk&repo=agentrix');
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

describe('createRepoDashboardHandlers', () => {
  it('read handler returns dashboard data', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const ensureRepo = mock.fn(async () => ({ repositoryPath: '/repo/path' }));
    const worktreeCounter = mock.fn(async () => 3);
    const githubClient = {
      countOpenPullRequests: mock.fn(async () => 5),
      countOpenIssues: mock.fn(async () => 10),
      listOpenIssues: mock.fn(async () => [{ number: 1, title: 'Issue 1' }]),
      countRunningWorkflows: mock.fn(async () => 2),
    };
    const now = mock.fn(() => new Date('2024-01-01T00:00:00Z'));

    const handlers = createRepoDashboardHandlers('/workdir', {
      ensureRepo,
      worktreeCounter,
      githubClient,
      now,
    });

    const context = createContext();

    await handlers.read(context);
    __setBaseHandlerTestOverrides();

    assert.equal(ensureRepo.mock.calls.length, 1);
    assert.deepEqual(ensureRepo.mock.calls[0]?.arguments, ['/workdir', 'vultuk', 'agentrix']);

    assert.equal(githubClient.countOpenPullRequests.mock.calls.length, 1);
    assert.equal(githubClient.countOpenIssues.mock.calls.length, 1);
    assert.equal(githubClient.listOpenIssues.mock.calls.length, 1);
    assert.equal(githubClient.countRunningWorkflows.mock.calls.length, 1);
    assert.equal(worktreeCounter.mock.calls.length, 1);

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    const response = call.arguments[2] as { data: unknown };
    assert.ok(response.data);
    assert.equal((response.data as { org: string }).org, 'vultuk');
    assert.equal((response.data as { repo: string }).repo, 'agentrix');
    assert.equal((response.data as { fetchedAt: string }).fetchedAt, '2024-01-01T00:00:00.000Z');
    assert.equal((response.data as { pullRequests: { open: number } }).pullRequests.open, 5);
    assert.equal((response.data as { issues: { open: number } }).issues.open, 10);
    assert.equal((response.data as { workflows: { running: number } }).workflows.running, 2);
    assert.equal((response.data as { worktrees: { local: number } }).worktrees.local, 3);
  });

  it('handles repository not found errors', async () => {
    __setBaseHandlerTestOverrides();

    const ensureRepo = mock.fn(async () => {
      throw new Error('Repository not found');
    });

    const handlers = createRepoDashboardHandlers('/workdir', {
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

  it('handles other repository errors', async () => {
    __setBaseHandlerTestOverrides();

    const ensureRepo = mock.fn(async () => {
      throw new Error('Permission denied');
    });

    const handlers = createRepoDashboardHandlers('/workdir', {
      ensureRepo,
    });

    const context = createContext();

    await handlers.read(context);
    __setBaseHandlerTestOverrides();

    // HttpError is thrown and handled by asyncHandler -> handleError (uses real sendJson)
    assert.equal(context.res.statusCode, 500);
    const endCalls = (context.res.end as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok(endCalls.length > 0);
    // Find the call with JSON error body (handleError sends this)
    const errorCall = endCalls.find((call) => {
      const arg = call.arguments[0];
      return typeof arg === 'string' && arg.includes('error');
    });
    assert.ok(errorCall);
    const body = JSON.parse(errorCall.arguments[0] as string);
    assert.deepEqual(body, { error: 'Permission denied' });
  });

  it('handles HEAD requests', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const ensureRepo = mock.fn(async () => ({ repositoryPath: '/repo/path' }));
    const handlers = createRepoDashboardHandlers('/workdir', { ensureRepo });

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

