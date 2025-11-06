import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { launchAgentProcess, __setAgentsTestOverrides } from './agents.js';
import type { TerminalSession } from '../types/terminal.js';

function createSession(overrides: Partial<TerminalSession> = {}): TerminalSession {
  return {
    id: 'session-1',
    key: 'acme::demo::feature',
    org: 'acme',
    repo: 'demo',
    branch: 'feature',
    process: { pid: 321, write: () => {} } as never,
    worktreePath: '/tmp/worktree',
    usingTmux: false,
    tmuxSessionName: null,
    log: '',
    watchers: new Set(),
    closed: false,
    waiters: [],
    pendingInputs: [],
    ready: true,
    readyTimer: null,
    kind: 'automation',
    lastActivityAt: Date.now(),
    idle: false,
    ...overrides,
  };
}

describe('launchAgentProcess', () => {
  beforeEach(() => {
    mock.restoreAll();
    __setAgentsTestOverrides();
  });

  afterEach(() => {
    mock.restoreAll();
    __setAgentsTestOverrides();
  });

  it('saves prompt to worktree and queues environment preparation when tmux is unavailable', async () => {
    const session = createSession();
    const createSessionMock = mock.fn(async () => session);
    const queueMock = mock.fn(() => {});
    const savePlanMock = mock.fn(async () => {});

    __setAgentsTestOverrides({
      createIsolatedTerminalSession: createSessionMock,
      queueSessionInput: queueMock,
      savePlanToWorktree: savePlanMock,
    });

    const result = await launchAgentProcess({
      command: 'agent-run',
      workdir: '/work',
      org: 'acme',
      repo: 'demo',
      branch: 'feature',
      prompt: 'Write plan\nwith details',
    });

    assert.equal(createSessionMock.mock.callCount(), 1);
    assert.equal(savePlanMock.mock.callCount(), 1);
    assert.equal(queueMock.mock.callCount(), 2);

    const [, envCommand] = queueMock.mock.calls[0].arguments;
    const [, commandInput] = queueMock.mock.calls[1].arguments;

    assert.equal(envCommand, "export AGENTRIX_PROMPT='Write plan\rwith details'\r");
    assert.equal(commandInput, "agent-run 'Write plan\rwith details'\r");

    assert.deepEqual(result, {
      pid: 321,
      command: 'agent-run',
      sessionId: 'session-1',
      tmuxSessionName: null,
      usingTmux: false,
      createdSession: true,
    });
  });

  it('logs plan persistence failures without aborting launch', async () => {
    const session = createSession();
    const createSessionMock = mock.fn(async () => session);
    const queueMock = mock.fn(() => {});
    const savePlanMock = mock.fn(async () => {
      throw new Error('disk error');
    });
    const warnMock = mock.method(console, 'warn', () => {});

    __setAgentsTestOverrides({
      createIsolatedTerminalSession: createSessionMock,
      queueSessionInput: queueMock,
      savePlanToWorktree: savePlanMock,
    });

    await launchAgentProcess({
      command: 'agent',
      workdir: '/root',
      org: 'acme',
      repo: 'demo',
      branch: 'feature',
      prompt: 'Plan',
    });

    assert.equal(warnMock.mock.callCount(), 1);
    assert.match(String(warnMock.mock.calls[0].arguments[0]), /Failed to persist automation plan/);
  });

  it('sets tmux environment when session uses tmux and prompt provided', async () => {
    const session = createSession({ usingTmux: true, tmuxSessionName: 'acme-demo' });
    const createSessionMock = mock.fn(async () => session);
    const queueMock = mock.fn(() => {});
    const savePlanMock = mock.fn(async () => {});
    const runTmuxMock = mock.fn(async () => {});

    __setAgentsTestOverrides({
      createIsolatedTerminalSession: createSessionMock,
      queueSessionInput: queueMock,
      savePlanToWorktree: savePlanMock,
      runTmux: runTmuxMock,
    });

    await launchAgentProcess({
      command: 'agent --run',
      workdir: '/work',
      org: 'acme',
      repo: 'demo',
      branch: 'feature',
      prompt: 'Generate diff',
    });

    assert.equal(savePlanMock.mock.callCount(), 1);
    assert.equal(runTmuxMock.mock.callCount(), 1);
    assert.deepEqual(runTmuxMock.mock.calls[0].arguments[0], [
      'set-environment',
      '-t',
      '=acme-demo',
      'AGENTRIX_PROMPT',
      'Generate diff',
    ]);
    assert.equal(queueMock.mock.callCount(), 1);
    const [, commandInput] = queueMock.mock.calls[0].arguments;
    assert.equal(commandInput, "agent --run 'Generate diff'\r");
  });

  it('falls back to shell export when tmux environment configuration fails', async () => {
    const session = createSession({ usingTmux: true, tmuxSessionName: 'acme-demo' });
    const createSessionMock = mock.fn(async () => session);
    const queueMock = mock.fn(() => {});
    const savePlanMock = mock.fn(async () => {});
    const runTmuxMock = mock.fn(async () => {
      throw new Error('tmux error');
    });
    const warnMock = mock.method(console, 'warn', () => {});

    __setAgentsTestOverrides({
      createIsolatedTerminalSession: createSessionMock,
      queueSessionInput: queueMock,
      savePlanToWorktree: savePlanMock,
      runTmux: runTmuxMock,
    });

    await launchAgentProcess({
      command: 'agent --run',
      workdir: '/work',
      org: 'acme',
      repo: 'demo',
      branch: 'feature',
      prompt: 'Summarise',
    });

    assert.equal(warnMock.mock.callCount(), 1);
    assert.equal(queueMock.mock.callCount(), 2);
    const [, envCommand] = queueMock.mock.calls[0].arguments;
    assert.equal(envCommand, "export AGENTRIX_PROMPT='Summarise'\r");
  });

  it('validates input arguments', async () => {
    await assert.rejects(
      () =>
        launchAgentProcess({
          command: '',
          workdir: '/work',
          org: 'acme',
          repo: 'demo',
          branch: 'feature',
          prompt: '',
        }),
      /Agent command is required/,
    );

    await assert.rejects(
      () =>
        launchAgentProcess({
          command: 'agent',
          workdir: '',
          org: 'acme',
          repo: 'demo',
          branch: 'feature',
          prompt: '',
        }),
      /workdir, org, repo, and branch are required/,
    );
  });
});


