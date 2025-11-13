import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it, mock } from 'node:test';

type TerminalSessionsModule = Awaited<typeof import('./terminal-sessions.js')>;
type TerminalSessionOverrides = NonNullable<
  Parameters<TerminalSessionsModule['__setTerminalSessionsTestOverrides']>[0]
>;

interface TimerHarness {
  setTimeout(fn: () => void, delay: number): number;
  clearTimeout(id: number): void;
  setInterval(fn: () => void, delay: number): number;
  clearInterval(id: number): void;
  advance(ms: number): void;
  clearAll(): void;
}

interface TerminalTestHarness {
  module: TerminalSessionsModule;
  spawnMock: ReturnType<typeof mock.fn>;
  emitSessionsUpdateMock: ReturnType<typeof mock.fn>;
  persistSessionsSnapshotMock: ReturnType<typeof mock.fn>;
  loadPersistedSessionsSnapshotMock: ReturnType<typeof mock.fn>;
  processes: FakePty[];
  timers: TimerHarness;
}

function sessionsFor(module: TerminalSessionsModule, org: string, repo: string, branch: string) {
  return module.listActiveSessions().filter((session) => session.org === org && session.repo === repo && session.branch === branch);
}

function createTimerHarness(): TimerHarness {
  let now = 0;
  let nextId = 1;
  const timeouts = new Map<number, { time: number; fn: () => void }>();
  const intervals = new Map<number, { next: number; interval: number; fn: () => void }>();

  function setTimeoutFn(fn: () => void, delay: number): number {
    const id = nextId++;
    timeouts.set(id, { time: now + Math.max(0, delay), fn });
    return id;
  }

  function clearTimeoutFn(id: number): void {
    timeouts.delete(id);
  }

  function setIntervalFn(fn: () => void, delay: number): number {
    const id = nextId++;
    const interval = Math.max(1, delay);
    intervals.set(id, { next: now + interval, interval, fn });
    return id;
  }

  function clearIntervalFn(id: number): void {
    intervals.delete(id);
  }

  function step(): boolean {
    let progressed = false;
    for (const [id, timeout] of [...timeouts]) {
      if (timeout.time <= now) {
        timeouts.delete(id);
        timeout.fn();
        progressed = true;
      }
    }
    for (const interval of intervals.values()) {
      if (interval.next <= now) {
        interval.next += interval.interval;
        interval.fn();
        progressed = true;
      }
    }
    return progressed;
  }

  function advance(ms: number): void {
    now += Math.max(0, ms);
    while (step()) {
      // continue processing until no callbacks are immediately due
    }
  }

  function clearAll(): void {
    timeouts.clear();
    intervals.clear();
  }

  return {
    setTimeout: setTimeoutFn,
    clearTimeout: clearTimeoutFn,
    setInterval: setIntervalFn,
    clearInterval: clearIntervalFn,
    advance,
    clearAll,
  };
}

class FakePty extends EventEmitter {
  public readonly write = mock.fn((input: string) => {
    this.writes.push(input);
  });

  public readonly resize = mock.fn();

  public readonly writes: string[] = [];

  public kill = mock.fn((signal?: string) => {
    queueMicrotask(() => {
      this.emit('exit', 0, signal ?? '');
    });
    return true;
  });

  public addData(chunk: string): void {
    queueMicrotask(() => {
      this.emit('data', chunk);
    });
  }
}

async function loadTerminalSessions(overrides?: TerminalSessionOverrides): Promise<TerminalTestHarness> {
  const fakeProcesses: FakePty[] = [];
  const spawnMock = mock.fn(() => {
    const proc = new FakePty();
    fakeProcesses.push(proc);
    return proc;
  });
  const emitSessionsUpdateMock = mock.fn();
  const persistSessionsSnapshotMock = mock.fn(async () => {});
  const loadPersistedSessionsSnapshotMock = mock.fn(async () => []);
  const timers = createTimerHarness();

  const module = await import('./terminal-sessions.js');
  if (typeof module.__resetTerminalSessionsState === 'function') {
    module.__resetTerminalSessionsState();
  }
  module.__setTerminalSessionsTestOverrides({
    spawnPty: (command, args, options) => spawnMock(command, args, options),
    getWorktreePath: async () => ({ worktreePath: '/tmp/worktrees/org/repo/branch' }),
    detectTmux: async () => {},
    isTmuxAvailable: () => true,
    makeTmuxSessionName: () => 'tmux-session',
    tmuxHasSession: async () => false,
    emitSessionsUpdate: (payload) => emitSessionsUpdateMock(payload),
    persistSessionsSnapshot: (payload) => persistSessionsSnapshotMock(payload),
    loadPersistedSessionsSnapshot: () => loadPersistedSessionsSnapshotMock(),
    setInterval: ((fn: () => void, delay?: number) =>
      timers.setInterval(fn, delay ?? 0)) as typeof setInterval,
    clearInterval: ((id: number | NodeJS.Timeout) =>
      timers.clearInterval(id as number)) as typeof clearInterval,
    setTimeout: ((fn: () => void, delay?: number) =>
      timers.setTimeout(fn, delay ?? 0)) as typeof setTimeout,
    clearTimeout: ((id: number | NodeJS.Timeout) =>
      timers.clearTimeout(id as number)) as typeof clearTimeout,
    ...(overrides ?? {}),
  });

  return {
    module,
    spawnMock,
    emitSessionsUpdateMock,
    persistSessionsSnapshotMock,
    loadPersistedSessionsSnapshotMock,
    processes: fakeProcesses,
    timers,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('terminal sessions', { concurrency: false }, () => {
  it('creates interactive sessions, queues input, and reuses existing sessions', { concurrency: false }, async () => {
    mock.reset();
    const { module, spawnMock, emitSessionsUpdateMock, persistSessionsSnapshotMock, processes, timers } =
      await loadTerminalSessions();
    const { getOrCreateTerminalSession, queueSessionInput, listActiveSessions, disposeAllSessions } = module;

    const session = await getOrCreateTerminalSession('/workspace', 'org', 'repo', 'feature', {
      mode: 'pty',
    });
    assert.ok(session);
    assert.equal(typeof session.id, 'string');
    const stored = module.getSessionById(session.id);
    assert.ok(stored);
    assert.equal(sessionsFor(module, 'org', 'repo', 'feature').length, 1);
    assert.equal(session.closed, false);
    assert.equal(session.org, 'org');
    assert.equal(session.repo, 'repo');
    assert.equal(session.branch, 'feature');
    assert.equal(spawnMock.mock.calls.length, 1);
    const proc = processes[0];
    assert.ok(proc);

    const initialWrites = proc.write.mock.calls.length;
    queueSessionInput(session, 'ls -la');

    timers.advance(200);

    assert.ok(proc.write.mock.calls.length >= initialWrites + 1);
    const lastCall = proc.write.mock.calls[proc.write.mock.calls.length - 1];
    assert.deepEqual(lastCall?.arguments, ['ls -la']);

    proc.addData('command output');
    await flushMicrotasks();
    assert.ok(session.log.includes('command output'));

    const reuse = await getOrCreateTerminalSession('/workspace', 'org', 'repo', 'feature', {
      mode: 'auto',
    });
    assert.equal('session' in reuse, true);
    if ('session' in reuse) {
      assert.equal(reuse.session.id, session.id);
      assert.equal(reuse.created, false);
    }

    const active = sessionsFor(module, 'org', 'repo', 'feature');
    assert.equal(active.length, 1);
    assert.equal(active[0]?.id, session.id);
    assert.equal(emitSessionsUpdateMock.mock.calls.length > 0, true);
    assert.equal(persistSessionsSnapshotMock.mock.calls.length > 0, true);

    await disposeAllSessions();
    await flushMicrotasks();
    timers.clearAll();
    module.__setTerminalSessionsTestOverrides();
  });

  it('persists session snapshots whenever updates are broadcast', { concurrency: false }, async () => {
    mock.reset();
    const { module, persistSessionsSnapshotMock } = await loadTerminalSessions();
    const { getOrCreateTerminalSession } = module;

    await getOrCreateTerminalSession('/workspace', 'org', 'repo', 'feature', {
      mode: 'pty',
    });

    assert.ok(persistSessionsSnapshotMock.mock.calls.length > 0);
  });

  it('does not persist when disposing all sessions during shutdown', { concurrency: false }, async () => {
    mock.reset();
    const { module, persistSessionsSnapshotMock } = await loadTerminalSessions();
    const { getOrCreateTerminalSession, disposeAllSessions } = module;

    await getOrCreateTerminalSession('/workspace', 'org', 'repo', 'feature', {
      mode: 'pty',
    });

    const initialCalls = persistSessionsSnapshotMock.mock.calls.length;
    await disposeAllSessions();
    const afterCalls = persistSessionsSnapshotMock.mock.calls.length;
    assert.equal(afterCalls, initialCalls);
  });

  it('rehydrates tmux sessions from snapshot when tmux state is available', { concurrency: false }, async () => {
    mock.reset();
    const tmuxHasSessionMock = mock.fn(async () => true);
    const detectTmuxMock = mock.fn(async () => {});
    const isTmuxAvailableMock = mock.fn(() => true);
    const persistedSummaries = [
      {
        org: 'acme',
        repo: 'demo',
        branch: 'feature/login',
        idle: false,
        lastActivityAt: '2024-01-01T00:00:00.000Z',
        sessions: [
          {
            id: 'snapshot-1',
            label: 'Terminal 9',
            kind: 'interactive',
            tool: 'terminal',
            idle: false,
            usingTmux: true,
            lastActivityAt: '2024-01-01T00:00:00.000Z',
            createdAt: '2024-01-01T00:00:00.000Z',
            tmuxSessionName: 'tmux-acme-demo-feature',
          },
        ],
      },
    ];
    const { module, spawnMock } = await loadTerminalSessions({
      loadPersistedSessionsSnapshot: async () => persistedSummaries,
      tmuxHasSession: (name: string) => tmuxHasSessionMock(name),
      detectTmux: () => detectTmuxMock(),
      isTmuxAvailable: () => isTmuxAvailableMock(),
    });

    await module.rehydrateTmuxSessionsFromSnapshot('/workspace', { mode: 'auto' });

    assert.equal(spawnMock.mock.calls.length > 0, true);
    const sessions = sessionsFor(module, 'acme', 'demo', 'feature/login');
    assert.equal(sessions.length, 1);
    const rehydrated = sessions[0];
    assert.ok(rehydrated);
    assert.equal(rehydrated.label, 'Terminal 9');
    assert.equal(rehydrated.tmuxSessionName, 'tmux-acme-demo-feature');
    assert.equal(rehydrated.org, 'acme');
    assert.equal(rehydrated.repo, 'demo');
    assert.equal(rehydrated.branch, 'feature/login');
  });

  it('skips rehydration when tmux sessions no longer exist', { concurrency: false }, async () => {
    mock.reset();
    const persistedSummaries = [
      {
        org: 'acme',
        repo: 'demo',
        branch: 'feature/login',
        idle: false,
        lastActivityAt: null,
        sessions: [
          {
            id: 'snapshot-1',
            label: 'Terminal 1',
            kind: 'interactive',
            tool: 'terminal',
            idle: false,
            usingTmux: true,
            lastActivityAt: null,
            createdAt: null,
            tmuxSessionName: 'tmux-missing',
          },
        ],
      },
    ];
    const { module } = await loadTerminalSessions({
      loadPersistedSessionsSnapshot: async () => persistedSummaries,
      tmuxHasSession: async () => false,
      isTmuxAvailable: () => true,
      detectTmux: async () => {},
    });

    await module.rehydrateTmuxSessionsFromSnapshot('/workspace', { mode: 'auto' });
    assert.equal(sessionsFor(module, 'acme', 'demo', 'feature/login').length, 0);
  });

  it('broadcasts to watchers and disposes sessions by id', { concurrency: false }, async () => {
    mock.reset();
    const { module, processes, emitSessionsUpdateMock, timers } = await loadTerminalSessions();
    const {
      getOrCreateTerminalSession,
      addSocketWatcher,
      disposeSessionById,
      listActiveSessions,
      disposeAllSessions,
    } = module;

    const session = await getOrCreateTerminalSession('/workspace', 'org', 'repo', 'feature', {
      mode: 'pty',
    });
    assert.equal(sessionsFor(module, 'org', 'repo', 'feature').length, 1);
    timers.advance(200);
    const proc = processes[0]!;

    const socket = new EventEmitter() as unknown as {
      readyState: number;
      send: (data: string | Buffer, options?: unknown) => void;
      terminate: () => void;
      close: () => void;
      on: (event: string, handler: () => void) => void;
    };
    const messages: Array<string | Buffer> = [];
    const closes: number[] = [];
    socket.readyState = 1;
    socket.send = (data: string | Buffer) => {
      messages.push(data);
    };
    socket.terminate = () => {
      closes.push(1);
    };
    socket.close = () => {
      closes.push(2);
      socket.readyState = 3;
      socket.emit?.('close');
    };

    addSocketWatcher(session, socket);
    proc.addData('watch-message');
    await flushMicrotasks();

    assert.equal(messages.length, 1);
    const payload = messages[0];
    if (Buffer.isBuffer(payload)) {
      assert.equal(payload.toString('utf8').includes('watch-message'), true);
    } else {
      assert.equal(payload.includes('watch-message'), true);
    }

    await disposeSessionById(session.id);
    await flushMicrotasks();

    assert.equal(sessionsFor(module, 'org', 'repo', 'feature').length, 0);
    assert.equal(
      messages.some((message) =>
        Buffer.isBuffer(message) ? message.toString('utf8').includes('"type":"exit"') : message.includes('"type":"exit"'),
      ),
      true,
    );
    assert.equal(closes.includes(2), true);
    assert.equal(emitSessionsUpdateMock.mock.calls.length > 0, true);

    await disposeAllSessions();
    await flushMicrotasks();
    timers.clearAll();
    module.__setTerminalSessionsTestOverrides();
  });

  it('uses tmux for isolated automation sessions when available', { concurrency: false }, async () => {
    mock.reset();
    const { module, spawnMock, timers } = await loadTerminalSessions({
      isTmuxAvailable: () => true,
    });
    const { createIsolatedTerminalSession, disposeAllSessions } = module;

    const session = await createIsolatedTerminalSession('/workspace', 'org', 'repo', 'feature');

    assert.equal(spawnMock.mock.calls[0]?.arguments[0], 'tmux');
    assert.equal(session.usingTmux, true);
    assert.equal(session.kind, 'automation');
    assert.ok(session.label?.startsWith('Agent'));

    await disposeAllSessions();
    await flushMicrotasks();
    timers.clearAll();
    module.__setTerminalSessionsTestOverrides();
  });

  it('assigns incremental labels per worktree and supports forced creation', { concurrency: false }, async () => {
    mock.reset();
    const { module, emitSessionsUpdateMock, timers } = await loadTerminalSessions();
    const { getOrCreateTerminalSession, listActiveSessions, disposeAllSessions } = module;

    const firstResult = await getOrCreateTerminalSession('/workspace', 'org', 'repo', 'feature', {
      mode: 'auto',
    });
    const firstSession = 'session' in firstResult ? firstResult.session : firstResult;
    assert.equal(firstSession.label, 'Terminal 1');

    const secondResult = await getOrCreateTerminalSession('/workspace', 'org', 'repo', 'feature', {
      mode: 'auto',
      forceNew: true,
    });

    const secondSession = 'session' in secondResult ? secondResult.session : secondResult;
    assert.equal(secondSession.label, 'Terminal 2');
    assert.equal(sessionsFor(module, 'org', 'repo', 'feature').length, 2);

    timers.advance(200);
    const lastPayload = emitSessionsUpdateMock.mock.calls.at(-1)?.arguments[0] as any[];
    assert.ok(Array.isArray(lastPayload));
    const summary = lastPayload.find((entry) => entry?.org === 'org' && entry?.branch === 'feature');
    assert.ok(summary);
    assert.equal(Array.isArray(summary.sessions), true);
    assert.equal(summary.sessions.length, 2);
    assert.equal(summary.sessions[0].label, 'Terminal 1');
    assert.equal(summary.sessions[1].label, 'Terminal 2');

    await disposeAllSessions();
    await flushMicrotasks();
    timers.clearAll();
    module.__setTerminalSessionsTestOverrides();
  });

});
