import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import type { RequestContext } from '../types/http.js';
import { ValidationError } from '../infrastructure/errors/index.js';
import {
  createPlanArtifactHandlers,
  __setPlansTestOverrides,
} from './plans.js';

function setupOverrides(deps?: {
  getWorktreePath?: typeof import('../core/git.js').getWorktreePath;
  listPlansForWorktree?: typeof import('../core/plan-storage.js').listPlansForWorktree;
  readPlanFromWorktree?: typeof import('../core/plan-storage.js').readPlanFromWorktree;
  extractWorktreeParams?: typeof import('../validation/index.js').extractWorktreeParams;
  sendJson?: typeof import('../utils/http.js').sendJson;
  extractErrorMessage?: typeof import('../infrastructure/errors/index.js').extractErrorMessage;
}) {
  const getWorktreePath = mock.fn(async () => ({ worktreePath: '/worktrees/path' }));
  const listPlans = mock.fn(async () => [{ id: 'plan-1', name: 'Plan 1' }]);
  const readPlan = mock.fn(async () => ({ id: 'plan-1', content: 'plan content' }));
  const extractParams = mock.fn((params: URLSearchParams) => ({
    org: params.get('org') || '',
    repo: params.get('repo') || '',
    branch: params.get('branch') || '',
  }));
  const sendJson = mock.fn();
  const extractError = mock.fn((err: unknown) => (err instanceof Error ? err.message : String(err)));

  __setPlansTestOverrides({
    getWorktreePath: deps?.getWorktreePath ?? getWorktreePath,
    listPlansForWorktree: deps?.listPlansForWorktree ?? listPlans,
    readPlanFromWorktree: deps?.readPlanFromWorktree ?? readPlan,
    extractWorktreeParams: deps?.extractWorktreeParams ?? extractParams,
    sendJson: deps?.sendJson ?? sendJson,
    extractErrorMessage: deps?.extractErrorMessage ?? extractError,
  });

  return {
    getWorktreePath,
    listPlansForWorktree: listPlans,
    readPlanFromWorktree: readPlan,
    extractWorktreeParams: extractParams,
    sendJson,
    extractErrorMessage: extractError,
  };
}

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const url = new URL('http://localhost/api/plans');
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

describe('createPlanArtifactHandlers', () => {
  it('list handler validates limit parameter', async () => {
    const { sendJson, extractWorktreeParams, getWorktreePath } = setupOverrides();

    const handlers = createPlanArtifactHandlers('/workdir');
    const url = new URL('http://localhost/api/plans?org=org&repo=repo&branch=branch&limit=-1');
    const context = createContext({ url });

    await handlers.list(context);
    __setPlansTestOverrides();

    // extractWorktreeParams is called before limit validation
    assert.equal(extractWorktreeParams.mock.calls.length, 1);
    // sendJson should be called when limit is invalid
    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 400);
    assert.deepEqual(call.arguments[2], { error: 'limit must be a positive integer' });
    // getWorktreePath should not be called when limit is invalid
    assert.equal(getWorktreePath.mock.calls.length, 0);
  });

  it('list handler validates limit NaN', async () => {
    const { sendJson } = setupOverrides();

    const handlers = createPlanArtifactHandlers('/workdir');
    const url = new URL('http://localhost/api/plans?org=org&repo=repo&branch=branch&limit=abc');
    const context = createContext({ url });

    await handlers.list(context);
    __setPlansTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 400);
    assert.deepEqual(call.arguments[2], { error: 'limit must be a positive integer' });
  });

  it('list handler calls listPlansForWorktree with parsed parameters', async () => {
    const { sendJson, getWorktreePath, listPlansForWorktree } = setupOverrides();

    const handlers = createPlanArtifactHandlers('/workdir');
    const url = new URL('http://localhost/api/plans?org=org&repo=repo&branch=branch&limit=10');
    const context = createContext({ url });

    await handlers.list(context);
    __setPlansTestOverrides();

    assert.equal(getWorktreePath.mock.calls.length, 1);
    assert.equal(listPlansForWorktree.mock.calls.length, 1);
    const listCall = listPlansForWorktree.mock.calls[0];
    assert.ok(listCall);
    assert.deepEqual(listCall.arguments[0], {
      worktreePath: '/worktrees/path',
      branch: 'branch',
      limit: 10,
    });

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    assert.deepEqual(call.arguments[2], { data: [{ id: 'plan-1', name: 'Plan 1' }] });
  });

  it('list handler handles worktree not found errors', async () => {
    const getWorktreePath = mock.fn(async () => {
      throw new Error('Worktree not found');
    });
    const { sendJson } = setupOverrides({ getWorktreePath });

    const handlers = createPlanArtifactHandlers('/workdir');
    const url = new URL('http://localhost/api/plans?org=org&repo=repo&branch=branch');
    const context = createContext({ url });

    await handlers.list(context);
    __setPlansTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 404);
    assert.deepEqual(call.arguments[2], { error: 'Worktree not found' });
  });

  it('list handler handles other errors', async () => {
    const getWorktreePath = mock.fn(async () => {
      throw new Error('Permission denied');
    });
    const { sendJson } = setupOverrides({ getWorktreePath });

    const handlers = createPlanArtifactHandlers('/workdir');
    const url = new URL('http://localhost/api/plans?org=org&repo=repo&branch=branch');
    const context = createContext({ url });

    await handlers.list(context);
    __setPlansTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 500);
    assert.deepEqual(call.arguments[2], { error: 'Permission denied' });
  });

  it('read handler requires planId parameter', async () => {
    const { sendJson } = setupOverrides();

    const handlers = createPlanArtifactHandlers('/workdir');
    const url = new URL('http://localhost/api/plans?org=org&repo=repo&branch=branch');
    const context = createContext({ url });

    await handlers.read(context);
    __setPlansTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 400);
    assert.deepEqual(call.arguments[2], { error: 'planId is required' });
  });

  it('read handler calls readPlanFromWorktree with parsed parameters', async () => {
    const { sendJson, getWorktreePath, readPlanFromWorktree } = setupOverrides();

    const handlers = createPlanArtifactHandlers('/workdir');
    const url = new URL('http://localhost/api/plans?org=org&repo=repo&branch=branch&planId=plan-123');
    const context = createContext({ url });

    await handlers.read(context);
    __setPlansTestOverrides();

    assert.equal(getWorktreePath.mock.calls.length, 1);
    assert.equal(readPlanFromWorktree.mock.calls.length, 1);
    const readCall = readPlanFromWorktree.mock.calls[0];
    assert.ok(readCall);
    assert.deepEqual(readCall.arguments[0], {
      worktreePath: '/worktrees/path',
      branch: 'branch',
      id: 'plan-123',
    });

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    assert.deepEqual(call.arguments[2], { data: { id: 'plan-1', content: 'plan content' } });
  });

  it('read handler handles plan not found errors', async () => {
    const readPlan = mock.fn(async () => {
      throw new Error('Plan not found');
    });
    const { sendJson } = setupOverrides({ readPlanFromWorktree: readPlan });

    const handlers = createPlanArtifactHandlers('/workdir');
    const url = new URL('http://localhost/api/plans?org=org&repo=repo&branch=branch&planId=missing');
    const context = createContext({ url });

    await handlers.read(context);
    __setPlansTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 404);
    assert.deepEqual(call.arguments[2], { error: 'Plan not found' });
  });

  it('handles validation errors from extractWorktreeParams', async () => {
    const extractParams = mock.fn(() => {
      throw new Error('Invalid parameters');
    });
    const { sendJson } = setupOverrides({ extractWorktreeParams: extractParams });

    const handlers = createPlanArtifactHandlers('/workdir');
    const url = new URL('http://localhost/api/plans');
    const context = createContext({ url });

    await handlers.list(context);
    __setPlansTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 400);
    assert.deepEqual(call.arguments[2], { error: 'Invalid parameters' });
  });
});
