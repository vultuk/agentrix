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
  processes: FakePty[];
  timers: TimerHarness;
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
  const timers = createTimerHarness();

  const module = await import(`./terminal-sessions.js?test=${Date.now()}-${Math.random()}`);
  module.__setTerminalSessionsTestOverrides({
    spawnPty: (command, args, options) => spawnMock(command, args, options),
    getWorktreePath: async () => ({ worktreePath: '/tmp/worktrees/org/repo/branch' }),
    detectTmux: async () => {},
    isTmuxAvailable: () => false,
    makeTmuxSessionName: () => 'tmux-session',
    tmuxHasSession: async () => false,
    emitSessionsUpdate: (payload) => emitSessionsUpdateMock(payload),
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
    processes: fakeProcesses,
    timers,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('terminal sessions', () => {
  it('creates interactive sessions, queues input, and reuses existing sessions', async () => {
    mock.reset();
    const { module, spawnMock, emitSessionsUpdateMock, processes, timers } = await loadTerminalSessions();
    const { getOrCreateTerminalSession, queueSessionInput, listActiveSessions, disposeAllSessions } = module;

    const session = await getOrCreateTerminalSession('/workspace', 'org', 'repo', 'feature', {
      mode: 'pty',
    });
    assert.ok(session);
    assert.equal(typeof session.id, 'string');
    const stored = module.getSessionById(session.id);
    assert.ok(stored);
    assert.equal(listActiveSessions().length, 1);
    assert.equal(session.closed, false);
    assert.equal(session.org, 'org');
    assert.equal(session.repo, 'repo');
    assert.equal(session.branch, 'feature');
    assert.equal(spawnMock.mock.calls.length, 1);
    const proc = processes[0];
    assert.ok(proc);

    queueSessionInput(session, 'ls -la');
    assert.equal(proc.write.mock.calls.length, 0);

    timers.advance(200);

    assert.equal(proc.write.mock.calls.length, 1);
    assert.deepEqual(proc.write.mock.calls[0]?.arguments, ['ls -la']);

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

    const active = listActiveSessions();
    assert.equal(active.length, 1);
    assert.equal(active[0]?.id, session.id);
    assert.equal(emitSessionsUpdateMock.mock.calls.length > 0, true);

    await disposeAllSessions();
    await flushMicrotasks();
    timers.clearAll();
    module.__setTerminalSessionsTestOverrides();
  });

  it('broadcasts to watchers and disposes sessions by id', async () => {
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
    assert.equal(listActiveSessions().length, 1);
    timers.advance(200);
    const proc = processes[0]!;

    const socket = new EventEmitter() as unknown as {
      readyState: number;
      send: (data: string) => void;
      terminate: () => void;
      close: () => void;
      on: (event: string, handler: () => void) => void;
    };
    const messages: string[] = [];
    const closes: number[] = [];
    socket.readyState = 1;
    socket.send = (data: string) => {
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
    assert.ok(messages[0]?.includes('watch-message'));

    await disposeSessionById(session.id);
    await flushMicrotasks();

    assert.equal(listActiveSessions().length, 0);
    assert.equal(messages.some((message) => message.includes('"type":"exit"')), true);
    assert.equal(closes.includes(2), true);
    assert.equal(emitSessionsUpdateMock.mock.calls.length > 0, true);

    await disposeAllSessions();
    await flushMicrotasks();
    timers.clearAll();
    module.__setTerminalSessionsTestOverrides();
  });

  it('uses tmux for isolated automation sessions when available', async () => {
    mock.reset();
    const { module, spawnMock, timers } = await loadTerminalSessions({
      isTmuxAvailable: () => true,
    });
    const { createIsolatedTerminalSession, disposeAllSessions } = module;

    const session = await createIsolatedTerminalSession('/workspace', 'org', 'repo', 'feature');

    assert.equal(spawnMock.mock.calls[0]?.arguments[0], 'tmux');
    assert.equal(session.usingTmux, true);
    assert.equal(session.kind, 'automation');

    await disposeAllSessions();
    await flushMicrotasks();
    timers.clearAll();
    module.__setTerminalSessionsTestOverrides();
  });

});
