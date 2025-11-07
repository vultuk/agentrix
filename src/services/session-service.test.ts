import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import {
  SessionService,
  createSessionService,
  __setSessionServiceTestOverrides,
} from './session-service.js';

describe('SessionService', () => {
  afterEach(() => {
    mock.restoreAll();
    __setSessionServiceTestOverrides();
  });

  it('aggregates in-memory sessions without tmux availability', async () => {
    const now = Date.now();

    const listSessionsMock = mock.fn(() => [
      { id: 'session-a' } as unknown,
      { id: 'session-b' } as unknown,
    ]);

    const makeKeyMock = mock.fn((org: string, repo: string, branch: string) => `${org}/${repo}/${branch}`);
    const detectMock = mock.fn(async () => ({ available: false, version: null }));
    const isAvailableMock = mock.fn(() => false);
    const serialiseMock = mock.fn(() => [
      {
        org: 'acme',
        repo: 'demo',
        branch: 'feature/login',
        idle: false,
        lastActivityAt: new Date(now).toISOString(),
        sessions: [
          {
            id: 'session-a',
            label: 'Terminal 1',
            kind: 'interactive',
            tool: 'terminal',
            idle: false,
            usingTmux: false,
            lastActivityAt: new Date(now - 1).toISOString(),
            createdAt: new Date(now - 10_000).toISOString(),
          },
          {
            id: 'session-b',
            label: 'Agent 1',
            kind: 'automation',
            tool: 'agent',
            idle: true,
            usingTmux: true,
            lastActivityAt: new Date(now).toISOString(),
            createdAt: new Date(now - 5_000).toISOString(),
          },
        ],
      },
    ]);

    __setSessionServiceTestOverrides({
      listActiveSessions: listSessionsMock,
      makeSessionKey: makeKeyMock,
      detectTmux: detectMock,
      isTmuxAvailable: isAvailableMock,
      serialiseSessions: serialiseMock,
      loadPersistedSessionsSnapshot: async () => [],
    });

    const service = new SessionService('/work');
    const sessions = await service.listSessions();

    assert.equal(sessions.length, 1);
    const [session] = sessions;
    assert.ok(session);
    assert.equal(session.org, 'acme');
    assert.equal(session.repo, 'demo');
    assert.equal(session.branch, 'feature/login');
    assert.equal(session.idle, false);
    assert.equal(typeof session.lastActivityAt, 'string');
    assert.equal(Array.isArray(session.sessions), true);
    assert.equal(session.sessions.length, 2);
    assert.equal(session.sessions[0]?.label, 'Terminal 1');
    assert.equal(session.sessions[1]?.label, 'Agent 1');
    assert.equal(session.sessions[1]?.kind, 'automation');
  });

  it('includes tmux sessions when available', async () => {
    const listSessionsMock = mock.fn(() => []);
    const serialiseMock = mock.fn(() => []);
    const makeKeyMock = mock.fn((org: string, repo: string, branch: string) => `${org}/${repo}/${branch}`);
    const detectMock = mock.fn(async () => ({ available: true, version: '3.3' }));
    const isAvailableMock = mock.fn(() => true);
    const runTmuxMock = mock.fn(async () => ({
      stdout: 'tw-acme--demo--feature-login\nrandom-entry\n',
      stderr: '',
    }));
    const discoverMock = mock.fn(async () => ({
      acme: {
        demo: {
          branches: ['main', 'feature/login'],
          initCommand: '',
        },
      },
    }));

    __setSessionServiceTestOverrides({
      listActiveSessions: listSessionsMock,
      makeSessionKey: makeKeyMock,
      detectTmux: detectMock,
      isTmuxAvailable: isAvailableMock,
      runTmux: runTmuxMock,
      discoverRepositories: discoverMock,
      serialiseSessions: serialiseMock,
      loadPersistedSessionsSnapshot: async () => [],
    });

    const service = createSessionService('/work');
    const sessions = await service.listSessions();

    assert.equal(sessions.length, 1);
    const [session] = sessions;
    assert.ok(session);
    assert.equal(session.org, 'acme');
    assert.equal(session.repo, 'demo');
    assert.equal(session.branch, 'feature/login');
    assert.equal(session.idle, false);
    assert.equal(session.lastActivityAt, null);
    assert.equal(Array.isArray(session.sessions), true);
    assert.equal(session.sessions.length, 0);
  });
});
  it('falls back to persisted snapshot when no live sessions are active', async () => {
    const listSessionsMock = mock.fn(() => []);
    const serialiseMock = mock.fn(() => []);
    const persistedSnapshot = [
      {
        org: 'acme',
        repo: 'demo',
        branch: 'feature/login',
        idle: true,
        lastActivityAt: '2024-01-01T00:00:00.000Z',
        sessions: [],
      },
    ];

    __setSessionServiceTestOverrides({
      listActiveSessions: listSessionsMock,
      serialiseSessions: serialiseMock,
      loadPersistedSessionsSnapshot: async () => persistedSnapshot,
      detectTmux: async () => {},
      isTmuxAvailable: () => false,
      makeSessionKey: (org: string, repo: string, branch: string) => `${org}/${repo}/${branch}`,
    });

    const service = new SessionService('/work');
    const sessions = await service.listSessions();

    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.branch, 'feature/login');
    assert.equal(sessions[0]?.idle, true);
  });
