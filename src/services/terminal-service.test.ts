import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import { ValidationError } from '../infrastructure/errors/index.js';
import {
  TerminalService,
  createTerminalService,
  __setTerminalServiceTestOverrides,
} from './terminal-service.js';

describe('TerminalService', () => {
  afterEach(() => {
    mock.restoreAll();
    __setTerminalServiceTestOverrides();
  });

  it('opens an existing session and queues command input', async () => {
    const session = { id: 'session-1', log: 'hello', closed: false };
    const getOrCreateMock = mock.fn(async (workdir: string, org: string, repo: string, branch: string, options: unknown) => {
      assert.equal(workdir, '/work');
      assert.equal(org, 'acme');
      assert.equal(repo, 'demo');
      assert.equal(branch, 'feature');
      assert.deepEqual(options, { mode: 'auto' });
      return { session, created: true };
    });

    const queueMock = mock.fn(() => undefined);

    __setTerminalServiceTestOverrides({
      getOrCreateTerminalSession: getOrCreateMock,
      queueSessionInput: queueMock,
    });

    const service = new TerminalService('/work');
    const result = await service.openTerminal({
      org: 'acme',
      repo: 'demo',
      branch: 'feature',
      command: 'ls',
      hasPrompt: false,
    });

    assert.deepEqual(result, {
      sessionId: 'session-1',
      log: 'hello',
      closed: false,
      created: true,
    });
    assert.equal(getOrCreateMock.mock.callCount(), 1);
    assert.equal(queueMock.mock.callCount(), 1);
    const queuedArgs = queueMock.mock.calls[0]?.arguments;
    assert.ok(queuedArgs);
    assert.equal(queuedArgs[0], session);
    assert.equal(queuedArgs[1], 'ls\r');
  });

  it('rejects terminal access for main branch', async () => {
    const service = createTerminalService('/work');
    await assert.rejects(
      service.openTerminal({ org: 'acme', repo: 'demo', branch: 'main', command: '', hasPrompt: false }),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.match(error.message, /main branch is disabled/);
        return true;
      }
    );
  });

  it('requires command when prompt is provided', async () => {
    const service = new TerminalService('/work');
    await assert.rejects(
      service.openTerminal({ org: 'acme', repo: 'demo', branch: 'feature', hasPrompt: true, command: '' }),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.match(error.message, /command must be provided/);
        return true;
      }
    );
  });

  it('launches agent process when prompt is provided', async () => {
    const launchMock = mock.fn(async (options: unknown) => {
      assert.deepEqual(options, {
        command: 'npm test',
        workdir: '/work',
        org: 'acme',
        repo: 'demo',
        branch: 'feature',
        prompt: 'Run tests',
      });
      return { sessionId: 'session-2', createdSession: true };
    });

    const session = { id: 'session-2', log: 'output', closed: false };
    const getSessionByIdMock = mock.fn((id: string) => {
      assert.equal(id, 'session-2');
      return session;
    });

    __setTerminalServiceTestOverrides({
      launchAgentProcess: launchMock,
      getSessionById: getSessionByIdMock,
    });

    const service = new TerminalService('/work', { mode: 'attached' });
    const result = await service.openTerminal({
      org: 'acme',
      repo: 'demo',
      branch: 'feature',
      command: 'npm test',
      hasPrompt: true,
      prompt: 'Run tests',
    });

    assert.deepEqual(result, {
      sessionId: 'session-2',
      log: 'output',
      closed: false,
      created: true,
    });
    assert.equal(launchMock.mock.callCount(), 1);
    assert.equal(getSessionByIdMock.mock.callCount(), 1);
  });

  it('throws when launched session cannot be resolved', async () => {
    const launchMock = mock.fn(async () => ({ sessionId: 'missing', createdSession: false }));
    const getSessionMock = mock.fn(() => undefined);

    __setTerminalServiceTestOverrides({
      launchAgentProcess: launchMock,
      getSessionById: getSessionMock,
    });

    const service = new TerminalService('/work');
    await assert.rejects(
      service.openTerminal({
        org: 'acme',
        repo: 'demo',
        branch: 'feature',
        command: 'npm test',
        hasPrompt: true,
        prompt: 'Run tests',
      }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /not found/);
        return true;
      }
    );
  });

  it('sends input to existing session', async () => {
    const session = { id: 'session-3', closed: false };
    const getSessionByIdMock = mock.fn((id: string) => {
      assert.equal(id, 'session-3');
      return session;
    });

    const queueMock = mock.fn(() => undefined);

    __setTerminalServiceTestOverrides({
      getSessionById: getSessionByIdMock,
      queueSessionInput: queueMock,
    });

    const service = createTerminalService('/work');
    const result = await service.sendInput({ sessionId: 'session-3', input: 'echo hello' });

    assert.deepEqual(result, { ok: true });
    assert.equal(getSessionByIdMock.mock.callCount(), 1);
    assert.equal(queueMock.mock.callCount(), 1);
  });

  it('rejects input for closed sessions', async () => {
    const getSessionMock = mock.fn(() => ({ id: 'session-4', closed: true }));
    __setTerminalServiceTestOverrides({ getSessionById: getSessionMock });

    const service = new TerminalService('/work');
    await assert.rejects(
      service.sendInput({ sessionId: 'session-4', input: 'exit' }),
      (error: unknown) => {
        assert.ok(error instanceof ValidationError);
        assert.match(error.message, /Terminal session not found/);
        return true;
      }
    );
  });
});

