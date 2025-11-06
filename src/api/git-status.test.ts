import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
  createGitStatusHandlers,
  __setGitStatusTestOverrides,
} from './git-status.js';
import { __setBaseHandlerTestOverrides } from './base-handler.js';
import { ValidationError } from '../infrastructure/errors/index.js';
import type { RequestContext } from '../types/http.js';

function setupOverrides(deps?: {
  getWorktreeStatus?: typeof import('../core/git.js').getWorktreeStatus;
  getWorktreeFileDiff?: typeof import('../core/git.js').getWorktreeFileDiff;
  extractWorktreeParams?: typeof import('../validation/index.js').extractWorktreeParams;
}) {
  // getWorktreeStatus returns a WorktreeStatus object, which is then wrapped in { status: ... } by the handler
  const getStatus = mock.fn(async () => ({ clean: true, modified: [], staged: [] }));
  const getDiff = mock.fn(async () => ({ diff: 'content' }));
  const extractParams = mock.fn((params: URLSearchParams) => ({
    org: params.get('org') || '',
    repo: params.get('repo') || '',
    branch: params.get('branch') || '',
  }));

  __setGitStatusTestOverrides({
    getWorktreeStatus: deps?.getWorktreeStatus ?? getStatus,
    getWorktreeFileDiff: deps?.getWorktreeFileDiff ?? getDiff,
    extractWorktreeParams: deps?.extractWorktreeParams ?? extractParams,
  });

  return { getWorktreeStatus: getStatus, getWorktreeFileDiff: getDiff, extractWorktreeParams: extractParams };
}

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const url = new URL('http://localhost/api/git-status');
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

describe('createGitStatusHandlers', () => {
  it('throws when workdir is missing', () => {
    assert.throws(() => createGitStatusHandlers(''), /workdir is required/);
  });

  it('read handler parses query parameters and calls getWorktreeStatus', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });
    const { getWorktreeStatus, extractWorktreeParams } = setupOverrides();

    const handlers = createGitStatusHandlers('/workdir');
    const url = new URL('http://localhost/api/git-status?org=vultuk&repo=agentrix&branch=main&entryLimit=10&commitLimit=5');
    const context = createContext({ url });

    await handlers.read(context);
    __setBaseHandlerTestOverrides();
    __setGitStatusTestOverrides();

    assert.equal(extractWorktreeParams.mock.calls.length, 1);
    assert.equal(getWorktreeStatus.mock.calls.length, 1);
    const statusCall = getWorktreeStatus.mock.calls[0];
    assert.ok(statusCall);
    assert.deepEqual(statusCall.arguments, [
      '/workdir',
      'vultuk',
      'agentrix',
      'main',
      {
        entryLimit: 10,
        commitLimit: 5,
      },
    ]);

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    assert.deepEqual(call.arguments[2], { status: { clean: true, modified: [], staged: [] } });
  });

  it('read handler handles invalid limit parameters', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });
    const { getWorktreeStatus } = setupOverrides();

    const handlers = createGitStatusHandlers('/workdir');
    const url = new URL('http://localhost/api/git-status?org=vultuk&repo=agentrix&branch=main&entryLimit=-5&commitLimit=abc');
    const context = createContext({ url });

    await handlers.read(context);
    __setBaseHandlerTestOverrides();
    __setGitStatusTestOverrides();

    const statusCall = getWorktreeStatus.mock.calls[0];
    assert.ok(statusCall);
    assert.deepEqual(statusCall.arguments[4], {
      entryLimit: undefined,
      commitLimit: undefined,
    });
  });

  it('read handler sets cache control header', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });
    setupOverrides();

    const handlers = createGitStatusHandlers('/workdir');
    const context = createContext();
    const setHeader = context.res.setHeader as ReturnType<typeof mock.fn>;

    await handlers.read(context);
    __setBaseHandlerTestOverrides();
    __setGitStatusTestOverrides();

    assert.equal(setHeader.mock.calls.length, 1);
    const headerCall = setHeader.mock.calls[0];
    assert.ok(headerCall);
    assert.equal(headerCall.arguments[0], 'Cache-Control');
    assert.equal(headerCall.arguments[1], 'no-store');
  });

  it('diff handler validates path parameter', async () => {
    __setBaseHandlerTestOverrides();
    const { getWorktreeFileDiff } = setupOverrides();

    const handlers = createGitStatusHandlers('/workdir');
    const context = createContext({
      readJsonBody: async () => ({
        org: 'org',
        repo: 'repo',
        branch: 'branch',
      }),
    });

    await handlers.diff(context);
    __setBaseHandlerTestOverrides();
    __setGitStatusTestOverrides();

    // ValidationError should be thrown before getWorktreeFileDiff is called
    assert.equal(getWorktreeFileDiff.mock.calls.length, 0);
    // Handler should complete without throwing (error is caught by asyncHandler)
  });

  it('diff handler calls getWorktreeFileDiff with parsed parameters', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });
    const { getWorktreeFileDiff, extractWorktreeParams } = setupOverrides();

    const handlers = createGitStatusHandlers('/workdir');
    const context = createContext({
      readJsonBody: async () => ({
        org: 'org',
        repo: 'repo',
        branch: 'branch',
        path: 'file.ts',
        previousPath: 'old.ts',
        mode: 'modified',
        status: 'M',
      }),
    });

    await handlers.diff(context);
    __setBaseHandlerTestOverrides();
    __setGitStatusTestOverrides();

    assert.equal(extractWorktreeParams.mock.calls.length, 1);
    assert.equal(getWorktreeFileDiff.mock.calls.length, 1);
    const diffCall = getWorktreeFileDiff.mock.calls[0];
    assert.ok(diffCall);
    assert.deepEqual(diffCall.arguments, [
      '/workdir',
      'org',
      'repo',
      'branch',
      {
        path: 'file.ts',
        previousPath: 'old.ts',
        mode: 'modified',
        status: 'M',
      },
    ]);

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    assert.deepEqual(call.arguments[2], { diff: 'content' });
  });

  it('diff handler handles optional parameters', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });
    const { getWorktreeFileDiff } = setupOverrides();

    const handlers = createGitStatusHandlers('/workdir');
    const context = createContext({
      readJsonBody: async () => ({
        org: 'org',
        repo: 'repo',
        branch: 'branch',
        path: 'file.ts',
      }),
    });

    await handlers.diff(context);
    __setBaseHandlerTestOverrides();
    __setGitStatusTestOverrides();

    const diffCall = getWorktreeFileDiff.mock.calls[0];
    assert.ok(diffCall);
    assert.deepEqual(diffCall.arguments[4], {
      path: 'file.ts',
      previousPath: undefined,
      mode: undefined,
      status: undefined,
    });
  });
});

