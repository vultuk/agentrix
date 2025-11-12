import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { createWorktreeHandlers } from './worktrees.js';
import { __setBaseHandlerTestOverrides } from './base-handler.js';
import type { RequestContext } from '../types/http.js';
import type { WorktreeService } from '../services/worktree-service.js';

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const url = new URL('http://localhost/api/worktrees');
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
    method: 'POST',
    workdir: '/tmp/workdir',
    readJsonBody: async () => ({}),
    params: {},
    ...overrides,
  };
}

describe('createWorktreeHandlers', () => {
  it('create handler validates payload and enqueues worktree creation', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const worktreeService = {
      createWorktree: mock.fn(async () => ({
        taskId: 'task-123',
        org: 'vultuk',
        repo: 'agentrix',
        branch: 'feature/test',
      })),
      deleteWorktree: mock.fn(),
    } as unknown as WorktreeService;

    const handlers = createWorktreeHandlers('/workdir', {}, {}, { worktreeService });

    const context = createContext({
      readJsonBody: async () => ({
        org: 'vultuk',
        repo: 'agentrix',
        branch: 'feature/test',
        prompt: 'Create feature branch',
      }),
    });

    await handlers.create(context);
    __setBaseHandlerTestOverrides();

    assert.equal(worktreeService.createWorktree.mock.calls.length, 1);
    const callArgs = worktreeService.createWorktree.mock.calls[0]?.arguments[0];
    assert.ok(callArgs);
    assert.equal(callArgs.org, 'vultuk');
    assert.equal(callArgs.repo, 'agentrix');
    assert.equal(callArgs.branch, 'feature/test');
    assert.equal(callArgs.prompt, 'Create feature branch');
    assert.equal(callArgs.hasPrompt, true);

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 202);
    assert.deepEqual(call.arguments[2], {
      taskId: 'task-123',
      org: 'vultuk',
      repo: 'agentrix',
      branch: 'feature/test',
    });
  });

  it('delete handler validates payload and returns result', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const worktreeService = {
      createWorktree: mock.fn(),
      deleteWorktree: mock.fn(async () => ({ removed: true })),
    } as unknown as WorktreeService;

    const handlers = createWorktreeHandlers('/workdir', {}, {}, { worktreeService });

    const context = createContext({
      readJsonBody: async () => ({
        org: 'vultuk',
        repo: 'agentrix',
        branch: 'feature/test',
      }),
    });

    await handlers.delete(context);
    __setBaseHandlerTestOverrides();

    assert.equal(worktreeService.deleteWorktree.mock.calls.length, 1);
    const callArgs = worktreeService.deleteWorktree.mock.calls[0]?.arguments[0];
    assert.ok(callArgs);
    assert.equal(callArgs.org, 'vultuk');
    assert.equal(callArgs.repo, 'agentrix');
    assert.equal(callArgs.branch, 'feature/test');

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    assert.deepEqual(call.arguments[2], { data: { removed: true } });
  });

  it('create handler returns validation errors', async () => {
    const worktreeService = {
      createWorktree: mock.fn(),
      deleteWorktree: mock.fn(),
    } as unknown as WorktreeService;

    const handlers = createWorktreeHandlers('/workdir', {}, {}, { worktreeService });

    const context = createContext({
      readJsonBody: async () => ({
        repo: 'agentrix',
      }),
    });

    await handlers.create(context);
    __setBaseHandlerTestOverrides();

    assert.equal(worktreeService.createWorktree.mock.calls.length, 0);
    assert.equal(context.res.statusCode, 400);
    const endCalls = (context.res.end as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok(endCalls.length > 0);
    const errorCall = endCalls.find((call) => {
      const arg = call.arguments[0];
      return typeof arg === 'string' && arg.includes('error');
    });
    assert.ok(errorCall);
    assert.match(errorCall.arguments[0] as string, /Missing required field/i);
  });

  it('aliases upsert and destroy map to create/delete', () => {
    const worktreeService = {
      createWorktree: mock.fn(),
      deleteWorktree: mock.fn(),
    } as unknown as WorktreeService;

    const handlers = createWorktreeHandlers('/workdir', {}, {}, { worktreeService });

    assert.equal(handlers.upsert, handlers.create);
    assert.equal(handlers.destroy, handlers.delete);
  });
});

