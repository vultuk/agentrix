import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { afterEach, describe, it, mock } from 'node:test';

import { createRepoHandlers } from './repos.js';
import { __setBaseHandlerTestOverrides } from './base-handler.js';
import type { RequestContext } from '../types/http.js';
import type { RepositoryService } from '../services/index.js';
import { createRepositoryService, __setRepositoryServiceTestOverrides } from '../services/repository-service.js';

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const url = new URL('http://localhost/api/repos');
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

describe('createRepoHandlers', () => {
  afterEach(() => {
    mock.restoreAll();
    __setBaseHandlerTestOverrides();
    __setRepositoryServiceTestOverrides();
  });

  it('list handler returns repository data', async () => {
    const repositoryService = {
      listRepositories: mock.fn(async () => ({
        vultuk: {
          agentrix: {
            branches: ['main'],
            initCommand: '',
          },
        },
      })),
    } as unknown as RepositoryService;

    const handlers = createRepoHandlers('/workdir', { repositoryService });
    const context = createContext();

    await handlers.list(context);

    assert.equal(repositoryService.listRepositories.mock.calls.length, 1);
    assert.equal(context.res.statusCode, 200);
    assert.equal(context.res.getHeader('Content-Type'), 'application/json; charset=utf-8');
    assert.equal(context.res.getHeader('Cache-Control'), 'no-store');
    const endCall = (context.res.end as ReturnType<typeof mock.fn>).mock.calls[0];
    assert.ok(endCall);
    const parsed = JSON.parse(endCall.arguments[0] as string);
    assert.deepEqual(parsed.data, {
      vultuk: {
        agentrix: {
          branches: ['main'],
          initCommand: '',
        },
      },
    });
  });

  it('list handler handles HEAD requests', async () => {
    const repositoryService = {
      listRepositories: mock.fn(async () => ({})),
    } as unknown as RepositoryService;

    const handlers = createRepoHandlers('/workdir', { repositoryService });
    const context = createContext({ method: 'HEAD' });
    const setHeader = context.res.setHeader as ReturnType<typeof mock.fn>;

    await handlers.list(context);

    assert.equal(repositoryService.listRepositories.mock.calls.length, 0);
    assert.equal(setHeader.mock.calls.some((call) => call?.arguments[0] === 'Cache-Control'), true);
  });

  it('create handler adds repository', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const repositoryService = {
      addRepository: mock.fn(async () => ({
        data: {
          vultuk: {
            agentrix: {
              branches: ['main'],
              initCommand: '',
            },
          },
        },
        repo: {
          org: 'vultuk',
          repo: 'agentrix',
        },
      })),
    } as unknown as RepositoryService;

    const handlers = createRepoHandlers('/workdir', { repositoryService });
    const context = createContext({
      method: 'POST',
      readJsonBody: async () => ({
        url: 'git@github.com:vultuk/agentrix.git',
        initCommand: 'npm install',
      }),
    });

    await handlers.create(context);

    assert.equal(repositoryService.addRepository.mock.calls.length, 1);
    assert.deepEqual(repositoryService.addRepository.mock.calls[0]?.arguments, [
      'git@github.com:vultuk/agentrix.git',
      'npm install',
    ]);

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
  });

  it('delete handler removes repository', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const repositoryService = {
      deleteRepository: mock.fn(async () => ({
        vultuk: {},
      })),
    } as unknown as RepositoryService;

    const handlers = createRepoHandlers('/workdir', { repositoryService });
    const context = createContext({
      method: 'POST',
      readJsonBody: async () => ({
        org: 'vultuk',
        repo: 'agentrix',
      }),
    });

    await handlers.delete(context);

    assert.equal(repositoryService.deleteRepository.mock.calls.length, 1);
    assert.deepEqual(repositoryService.deleteRepository.mock.calls[0]?.arguments, ['vultuk', 'agentrix']);

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    assert.deepEqual(call.arguments[2], {
      data: {
        vultuk: {},
      },
    });
  });

  it('updateInitCommand handler updates init command', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const repositoryService = {
      updateInitCommand: mock.fn(async () => ({
        vultuk: {
          agentrix: {
            branches: ['main'],
            initCommand: 'npm run build',
          },
        },
      })),
    } as unknown as RepositoryService;

    const handlers = createRepoHandlers('/workdir', { repositoryService });
    const context = createContext({
      method: 'POST',
      readJsonBody: async () => ({
        org: 'vultuk',
        repo: 'agentrix',
        initCommand: 'npm run build',
      }),
    });

    await handlers.updateInitCommand(context);

    assert.equal(repositoryService.updateInitCommand.mock.calls.length, 1);
    assert.deepEqual(repositoryService.updateInitCommand.mock.calls[0]?.arguments, [
      'vultuk',
      'agentrix',
      'npm run build',
    ]);

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    assert.deepEqual(call.arguments[2], {
      data: {
        vultuk: {
          agentrix: {
            branches: ['main'],
            initCommand: 'npm run build',
          },
        },
      },
    });
  });

  it('exposes deprecated destroy alias', () => {
    const repositoryService = {
      listRepositories: mock.fn(),
      addRepository: mock.fn(),
      deleteRepository: mock.fn(),
      updateInitCommand: mock.fn(),
    } as unknown as RepositoryService;

    const handlers = createRepoHandlers('/workdir', { repositoryService });

    assert.equal(handlers.destroy, handlers.delete);
  });

  it('create handler returns 400 for traversal repository URLs before touching the filesystem', async () => {
    const mkdirMock = mock.method(fs, 'mkdir', async () => {
      throw new Error('mkdir should not run for invalid URLs');
    });

    __setRepositoryServiceTestOverrides({
      refreshRepositoryCache: async () => ({}),
    });

    const repositoryService = createRepositoryService('/tmp/workdir');
    const handlers = createRepoHandlers('/tmp/workdir', { repositoryService });
    const context = createContext({
      method: 'POST',
      readJsonBody: async () => ({
        url: 'git@github.com:../etc/passwd.git',
        initCommand: '',
      }),
    });

    await handlers.create(context);

    assert.equal(context.res.statusCode, 400);
    const payloadCall = (context.res.end as ReturnType<typeof mock.fn>).mock.calls[0];
    assert.ok(payloadCall);
    const payload = JSON.parse(payloadCall.arguments[0] as string);
    assert.match(
      payload.error as string,
      /organization cannot (?:be a traversal segment|contain path separators)/i
    );
    assert.equal(mkdirMock.mock.callCount(), 0);
  });

  it('delete handler rejects traversal identifiers before repository lookup', async () => {
    const statMock = mock.method(fs, 'stat', async () => {
      throw new Error('stat should not run for invalid identifiers');
    });

    __setRepositoryServiceTestOverrides({
      refreshRepositoryCache: async () => ({}),
    });

    const repositoryService = createRepositoryService('/tmp/workdir');
    const handlers = createRepoHandlers('/tmp/workdir', { repositoryService });
    const context = createContext({
      method: 'POST',
      readJsonBody: async () => ({
        org: '../etc',
        repo: 'demo',
      }),
    });

    await handlers.delete(context);

    assert.equal(context.res.statusCode, 400);
    const payloadCall = (context.res.end as ReturnType<typeof mock.fn>).mock.calls[0];
    assert.ok(payloadCall);
    const payload = JSON.parse(payloadCall.arguments[0] as string);
    assert.match(
      payload.error as string,
      /organization cannot (?:be a traversal segment|contain path separators)/i
    );
    assert.equal(statMock.mock.callCount(), 0);
  });
});
