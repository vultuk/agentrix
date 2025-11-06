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
      {
        org: 'acme',
        repo: 'demo',
        branch: 'feature/login',
        idle: false,
        lastActivityAt: now - 1,
      } as unknown,
      {
        org: 'acme',
        repo: 'demo',
        branch: 'feature/login',
        idle: true,
        lastActivityAt: new Date(now),
      } as unknown,
    ]);

    const makeKeyMock = mock.fn((org: string, repo: string, branch: string) => `${org}/${repo}/${branch}`);
    const detectMock = mock.fn(async () => ({ available: false, version: null }));
    const isAvailableMock = mock.fn(() => false);

    __setSessionServiceTestOverrides({
      listActiveSessions: listSessionsMock,
      makeSessionKey: makeKeyMock,
      detectTmux: detectMock,
      isTmuxAvailable: isAvailableMock,
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
  });

  it('includes tmux sessions when available', async () => {
    const listSessionsMock = mock.fn(() => []);
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
  });
});

