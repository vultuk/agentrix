import { randomUUID } from 'node:crypto';
import pty from 'node-pty';
import type {
  TerminalSession,
  SessionKind,
  SessionTool,
  WorktreeSessionSummary,
  TerminalSessionSnapshot,
} from '../types/terminal.js';

import { MAX_TERMINAL_BUFFER, TMUX_BIN } from '../config/constants.js';
import { getWorktreePath } from './git.js';
import {
  detectTmux,
  isTmuxAvailable,
  makeTmuxSessionName,
  tmuxHasSession,
} from './tmux.js';
import { emitSessionsUpdate } from './event-bus.js';

const IDLE_TIMEOUT_MS = 90 * 1000;
const IDLE_SWEEP_INTERVAL_MS = 5 * 1000;

interface TerminalSessionDependencies {
  spawnPty: typeof pty.spawn;
  getWorktreePath: typeof getWorktreePath;
  detectTmux: typeof detectTmux;
  isTmuxAvailable: typeof isTmuxAvailable;
  makeTmuxSessionName: typeof makeTmuxSessionName;
  tmuxHasSession: typeof tmuxHasSession;
  emitSessionsUpdate: typeof emitSessionsUpdate;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
}

const defaultTerminalSessionDependencies: TerminalSessionDependencies = {
  spawnPty: pty.spawn.bind(pty),
  getWorktreePath,
  detectTmux,
  isTmuxAvailable,
  makeTmuxSessionName,
  tmuxHasSession,
  emitSessionsUpdate,
  setInterval: globalThis.setInterval.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
};

let terminalSessionTestOverrides: Partial<TerminalSessionDependencies> | null = null;

export function __setTerminalSessionsTestOverrides(
  overrides?: Partial<TerminalSessionDependencies>,
): void {
  terminalSessionTestOverrides = overrides ?? null;
}

function resolveTerminalDependency<K extends keyof TerminalSessionDependencies>(
  key: K,
): TerminalSessionDependencies[K] {
  if (terminalSessionTestOverrides && terminalSessionTestOverrides[key]) {
    return terminalSessionTestOverrides[key] as TerminalSessionDependencies[K];
  }
  return defaultTerminalSessionDependencies[key];
}

const terminalSessions = new Map<string, Map<string, TerminalSession>>();
const terminalSessionsById = new Map<string, TerminalSession>();
const sessionLabelCounters = new Map<string, { terminal: number; agent: number }>();
let idleMonitorTimer: NodeJS.Timeout | null = null;

function ensureIdleMonitor() {
  if (idleMonitorTimer) {
    return;
  }
  idleMonitorTimer = resolveTerminalDependency('setInterval')(runIdleSweep, IDLE_SWEEP_INTERVAL_MS);
}

function stopIdleMonitorIfInactive() {
  if (!idleMonitorTimer) {
    return;
  }
  if (terminalSessionsById.size === 0) {
    resolveTerminalDependency('clearInterval')(idleMonitorTimer);
    idleMonitorTimer = null;
  }
}

function allocateSessionLabel(key: string, tool: SessionTool): string {
  const counters = sessionLabelCounters.get(key) ?? { terminal: 0, agent: 0 };
  const counterKey = tool === 'agent' ? 'agent' : 'terminal';
  counters[counterKey] += 1;
  sessionLabelCounters.set(key, counters);
  const base = tool === 'agent' ? 'Agent' : 'Terminal';
  return `${base} ${counters[counterKey]}`;
}

function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function resetSessionCountersIfEmpty(key: string): void {
  if (!terminalSessions.has(key)) {
    sessionLabelCounters.delete(key);
  }
}

function normaliseTimestamp(value: number | Date | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  return null;
}

function formatTimestamp(value: number | Date | undefined): string | null {
  const ms = normaliseTimestamp(value);
  return ms ? new Date(ms).toISOString() : null;
}

function buildSessionSnapshot(session: TerminalSession): TerminalSessionSnapshot {
  const lastActivityAt = formatTimestamp(session.lastActivityAt);
  const createdAt = formatTimestamp(session.createdAt);
  const resolvedTool =
    session.tool ?? (session.kind === 'automation' ? 'agent' : ('terminal' as SessionTool));
  const resolvedLabel =
    typeof session.label === 'string' && session.label.trim().length > 0
      ? session.label
      : resolvedTool === 'agent'
      ? 'Agent'
      : 'Terminal';
  return {
    id: session.id,
    label: resolvedLabel,
    kind: session.kind ?? 'interactive',
    tool: resolvedTool,
    idle: Boolean(session.idle),
    usingTmux: Boolean(session.usingTmux),
    lastActivityAt,
    createdAt,
  };
}

function getSessionBucket(key: string, create: boolean = false): Map<string, TerminalSession> | undefined {
  let bucket = terminalSessions.get(key);
  if (!bucket && create) {
    bucket = new Map();
    terminalSessions.set(key, bucket);
  }
  return bucket;
}

function addSession(session: TerminalSession): void {
  const bucket = getSessionBucket(session.key, true)!;
  bucket.set(session.id, session);
  terminalSessionsById.set(session.id, session);
  ensureIdleMonitor();
  resolveTerminalDependency('emitSessionsUpdate')(serialiseSessions(listActiveSessions()));
}

function removeSession(session: TerminalSession): void {
  const bucket = terminalSessions.get(session.key);
  if (bucket) {
    bucket.delete(session.id);
    if (bucket.size === 0) {
      terminalSessions.delete(session.key);
      resetSessionCountersIfEmpty(session.key);
    }
  }
  terminalSessionsById.delete(session.id);
  stopIdleMonitorIfInactive();
}

function listSessionsForKey(key: string): TerminalSession[] {
  const bucket = terminalSessions.get(key);
  if (!bucket) {
    return [];
  }
  return Array.from(bucket.values());
}

function normaliseSessionInput(input: string | Buffer): string {
  if (typeof input === 'string') {
    return input;
  }
  if (Buffer.isBuffer(input)) {
    return input.toString('utf8');
  }
  return '';
}

function flushPendingInputs(session: TerminalSession): void {
  if (!session || !Array.isArray(session.pendingInputs) || session.pendingInputs.length === 0) {
    return;
  }
  const inputs = session.pendingInputs.slice();
  session.pendingInputs.length = 0;
  inputs.forEach((value) => {
    if (!value) {
      return;
    }
    try {
      session.process.write(value);
    } catch {
      // ignore write errors; process lifecycle handlers will surface issues elsewhere
    }
  });
}

function noteSessionActivity(session: TerminalSession): boolean {
  if (!session || session.closed) {
    return false;
  }
  const now = Date.now();
  session.lastActivityAt = now;
  if (session.idle) {
    session.idle = false;
    return true;
  }
  return false;
}

function markSessionReady(session: TerminalSession): void {
  if (!session || session.ready) {
    return;
  }
  session.ready = true;
  if (session.readyTimer) {
    resolveTerminalDependency('clearTimeout')(session.readyTimer);
    session.readyTimer = null;
  }
  flushPendingInputs(session);
}

export function queueSessionInput(session: TerminalSession, input: string | Buffer): void {
  if (!session || session.closed) {
    return;
  }
  if (!Array.isArray(session.pendingInputs)) {
    session.pendingInputs = [];
  }
  const value = normaliseSessionInput(input);
  if (!value) {
    return;
  }
  const becameActive = noteSessionActivity(session);
  if (session.ready) {
    try {
      session.process.write(value);
    } catch {
      // ignore write errors
    }
  } else {
    session.pendingInputs.push(value);
  }
  if (becameActive) {
    resolveTerminalDependency('emitSessionsUpdate')(serialiseSessions(listActiveSessions()));
  }
}

function trimLogBuffer(log: string): string {
  if (log.length <= MAX_TERMINAL_BUFFER) {
    return log;
  }
  return log.slice(log.length - MAX_TERMINAL_BUFFER);
}

function broadcast(session: TerminalSession, event: string, payload: Record<string, unknown>): void {
  const message = JSON.stringify({ type: event, ...payload });
  session.watchers.forEach((watcher) => {
    const socket = watcher.socket;
    if (!socket || socket.readyState !== 1) {
      try {
        socket?.terminate();
      } catch {
        // ignore terminate errors
      }
      session.watchers.delete(watcher);
      return;
    }

    try {
      socket.send(message);
    } catch {
      try {
        socket.terminate();
      } catch {
        // ignore
      }
      session.watchers.delete(watcher);
    }
  });
}

function handleSessionOutput(session: TerminalSession, chunk: string | Buffer): void {
  markSessionReady(session);
  const becameActive = noteSessionActivity(session);
  const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  session.log = trimLogBuffer((session.log || '') + text);
  broadcast(session, 'output', { chunk: text });
  if (becameActive) {
    emitSessionsUpdate(serialiseSessions(listActiveSessions()));
  }
}

export function serialiseSessions(sessions: TerminalSession[]): WorktreeSessionSummary[] {
  const summaries = new Map<
    string,
    { entry: WorktreeSessionSummary; lastActivityAtMs: number | null }
  >();
  sessions.forEach((session) => {
    if (!session) {
      return;
    }
    const key = session.key;
    const snapshot = buildSessionSnapshot(session);
    const lastActivityAtMs = normaliseTimestamp(session.lastActivityAt);
    const existing = summaries.get(key);
    if (!existing) {
      summaries.set(key, {
        entry: {
          org: session.org,
          repo: session.repo,
          branch: session.branch,
          idle: Boolean(session.idle),
          lastActivityAt: snapshot.lastActivityAt,
          sessions: [snapshot],
        },
        lastActivityAtMs,
      });
      return;
    }
    existing.entry.sessions.push(snapshot);
    existing.entry.idle = existing.entry.idle && Boolean(session.idle);
    if (
      typeof lastActivityAtMs === 'number' &&
      (!existing.lastActivityAtMs || lastActivityAtMs > existing.lastActivityAtMs)
    ) {
      existing.lastActivityAtMs = lastActivityAtMs;
      existing.entry.lastActivityAt = snapshot.lastActivityAt;
    }
  });
  return Array.from(summaries.values()).map(({ entry }) => entry);
}

function runIdleSweep() {
  if (terminalSessionsById.size === 0) {
    stopIdleMonitorIfInactive();
    return;
  }
  const now = Date.now();
  let changed = false;

  terminalSessionsById.forEach((session) => {
    if (!session || session.closed) {
      return;
    }
    const last =
      typeof session.lastActivityAt === 'number'
        ? session.lastActivityAt
        : session.lastActivityAt instanceof Date
        ? session.lastActivityAt.getTime()
        : null;
    if (!last) {
      session.lastActivityAt = now;
      return;
    }
    if (!session.idle && now - last >= IDLE_TIMEOUT_MS) {
      session.idle = true;
      changed = true;
    }
  });

  if (changed) {
    resolveTerminalDependency('emitSessionsUpdate')(serialiseSessions(listActiveSessions()));
  }
}

function handleSessionExit(session: TerminalSession, code: number, signal: string, error?: Error): void {
  if (session.closed) {
    return;
  }
  session.closed = true;
  session.exitCode = code;
  session.exitSignal = signal;
  session.exitError = error ? error.message : undefined;
  if (session.readyTimer) {
    resolveTerminalDependency('clearTimeout')(session.readyTimer);
    session.readyTimer = null;
  }
  if (Array.isArray(session.pendingInputs)) {
    session.pendingInputs.length = 0;
  }
  broadcast(session, 'exit', {
    code: session.exitCode,
    signal: session.exitSignal,
    error: session.exitError,
  });
  session.watchers.forEach((watcher) => {
    if (watcher.socket && watcher.socket.readyState === 1) {
      try {
        watcher.socket.close();
      } catch {
        // ignore
      }
    }
  });
  session.watchers.clear();
  removeSession(session);
  if (session.waiters) {
    session.waiters.forEach((resolve) => resolve());
    session.waiters = [];
  }
  resolveTerminalDependency('emitSessionsUpdate')(serialiseSessions(listActiveSessions()));
}

export function makeSessionKey(org: string, repo: string, branch: string): string {
  return `${org}::${repo}::${branch}`;
}

function determineShellArgs(shellCommand: string): string[] {
  if (!shellCommand) {
    return [];
  }
  const name = shellCommand.split('/').pop();
  if (name === 'bash' || name === 'zsh' || name === 'fish') {
    return ['-il'];
  }
  return [];
}

async function terminateSession(session: TerminalSession, options: { signal?: string; forceAfter?: number } = {}): Promise<void> {
  if (!session || session.closed) {
    return;
  }

  await new Promise<void>((resolve) => {
    session.waiters = session.waiters || [];
    session.waiters.push(resolve as () => void);
    try {
      session.process.kill(options.signal || 'SIGTERM');
    } catch {
      resolve();
      return;
    }
    resolveTerminalDependency('setTimeout')(() => {
      if (!session.closed) {
        try {
          session.process.kill('SIGKILL');
        } catch {
          // ignore
        }
      }
    }, options.forceAfter ?? 2000);
  });
}

export async function disposeSessionByKey(key: string): Promise<void> {
  const sessions = listSessionsForKey(key);
  if (sessions.length === 0) {
    return;
  }
  const tasks = sessions.map((session) => terminateSession(session).catch(() => {}));
  await Promise.allSettled(tasks);
  resolveTerminalDependency('emitSessionsUpdate')(serialiseSessions(listActiveSessions()));
}

export async function disposeSessionsForRepository(org: string, repo: string): Promise<void> {
  if (!org || !repo) {
    return;
  }
  const targets: TerminalSession[] = [];
  terminalSessionsById.forEach((session) => {
    if (!session || session.closed) {
      return;
    }
    if (session.org === org && session.repo === repo) {
      targets.push(session);
    }
  });
  if (targets.length === 0) {
    return;
  }
  const tasks = targets.map((session) => terminateSession(session).catch(() => {}));
  await Promise.allSettled(tasks);
  resolveTerminalDependency('emitSessionsUpdate')(serialiseSessions(listActiveSessions()));
}

export async function disposeSessionById(sessionId: string): Promise<void> {
  const session = terminalSessionsById.get(sessionId);
  if (!session) {
    return;
  }
  await terminateSession(session);
  resolveTerminalDependency('emitSessionsUpdate')(serialiseSessions(listActiveSessions()));
}

export async function disposeAllSessions(): Promise<void> {
  const activeSessions = Array.from(terminalSessionsById.values());
  if (activeSessions.length === 0) {
    return;
  }
  const closures = activeSessions.map((session) =>
    terminateSession(session, { signal: 'SIGTERM', forceAfter: 0 }).catch(() => {}),
  );
  await Promise.allSettled(closures);
  terminalSessions.clear();
  terminalSessionsById.clear();
  stopIdleMonitorIfInactive();
  resolveTerminalDependency('emitSessionsUpdate')([]);
}

export function getSessionById(sessionId: string): TerminalSession | undefined {
  return terminalSessionsById.get(sessionId);
}

export function listActiveSessions(): TerminalSession[] {
  return Array.from(terminalSessionsById.values()).filter((session) => session && !session.closed);
}

export function addSocketWatcher(session: TerminalSession, socket: unknown): void {
  const ws = socket as { on: (event: string, handler: () => void) => void };
  const watcher = { socket: ws as never };
  session.watchers.add(watcher);
  ws.on('close', () => {
    session.watchers.delete(watcher);
  });
}

async function spawnTerminalProcess({
  workdir,
  org,
  repo,
  branch,
  useTmux,
  requireTmux = false,
  tmuxSessionNameOverride,
}: {
  workdir: string;
  org: string;
  repo: string;
  branch: string;
  useTmux?: boolean;
  requireTmux?: boolean;
  tmuxSessionNameOverride?: string | null;
}) {
  const { worktreePath } = await resolveTerminalDependency('getWorktreePath')(
    workdir,
    org,
    repo,
    branch,
  );
  const shellCommand = process.env['SHELL'] || '/bin/bash';
  const args = determineShellArgs(shellCommand);

  let child;
  let usingTmux = false;
  let tmuxSessionName = null;
  let tmuxSessionExists = false;
  const baseEnv: Record<string, string | undefined> = {
    ...process.env,
    TERM: process.env['TERM'] || 'xterm-256color',
  };
  if (baseEnv['TMUX']) {
    delete baseEnv['TMUX'];
  }
  if (baseEnv['TMUX_PANE']) {
    delete baseEnv['TMUX_PANE'];
  }

  if (useTmux) {
    await resolveTerminalDependency('detectTmux')();
    if (resolveTerminalDependency('isTmuxAvailable')()) {
      tmuxSessionName = tmuxSessionNameOverride || resolveTerminalDependency('makeTmuxSessionName')(org, repo, branch);
      tmuxSessionExists = await resolveTerminalDependency('tmuxHasSession')(tmuxSessionName);
      const tmuxArgs = tmuxSessionExists
        ? ['attach-session', '-t', tmuxSessionName]
        : ['new-session', '-s', tmuxSessionName, '-x', '120', '-y', '36'];

      if (!tmuxSessionExists) {
        // Keep the tmux client attached so the PTY stays open on first launch.
        tmuxArgs.push(shellCommand);
        if (args.length > 0) {
          tmuxArgs.push(...args);
        }
      }

      const tmuxEnv = { ...baseEnv };

      child = resolveTerminalDependency('spawnPty')(TMUX_BIN, tmuxArgs, {
        cwd: worktreePath,
        env: tmuxEnv,
        cols: 120,
        rows: 36,
      });
      usingTmux = true;
    } else if (requireTmux) {
      throw new Error(
        'tmux is required for terminal sessions but was not detected on PATH. Install tmux or start the server with --no-tmux.',
      );
    }
  }

  if (!child) {
    child = resolveTerminalDependency('spawnPty')(shellCommand, args, {
      cwd: worktreePath,
      env: baseEnv,
      cols: 120,
      rows: 36,
    });
  }

  return {
    child,
    usingTmux,
    tmuxSessionName,
    tmuxSessionExists,
    worktreePath,
  };
}

async function createTerminalSession(
  workdir: string,
  org: string,
  repo: string,
  branch: string,
  options: {
    useTmux?: boolean;
    kind?: SessionKind;
    tool?: SessionTool;
    requireTmux?: boolean;
    forceUniqueTmux?: boolean;
  } = {}
): Promise<TerminalSession> {
  const { useTmux = true, kind = 'interactive', tool, requireTmux = false, forceUniqueTmux = false } = options;
  const resolvedKind: SessionKind = kind === 'automation' ? 'automation' : 'interactive';
  const key = makeSessionKey(org, repo, branch);
  const resolvedTool: SessionTool = tool ?? (resolvedKind === 'automation' ? 'agent' : 'terminal');
  const label = allocateSessionLabel(key, resolvedTool);
  const createdAt = Date.now();
  const labelSlug = slugifyLabel(label) || 'session';
  const tmuxSessionNameOverride =
    Boolean(useTmux && forceUniqueTmux)
      ? `${resolveTerminalDependency('makeTmuxSessionName')(org, repo, branch)}--${labelSlug}`
      : undefined;
  const { child, usingTmux, tmuxSessionName, worktreePath } = await spawnTerminalProcess({
    workdir,
    org,
    repo,
    branch,
    useTmux,
    requireTmux,
    tmuxSessionNameOverride,
  });

  const session: TerminalSession = {
    id: randomUUID(),
    key,
    org,
    repo,
    branch,
    process: child,
    worktreePath,
    usingTmux,
    tmuxSessionName,
    log: '',
    watchers: new Set(),
    closed: false,
    waiters: [],
    pendingInputs: [],
    ready: false,
    readyTimer: null,
    kind: resolvedKind,
    tool: resolvedTool,
    label,
    lastActivityAt: createdAt,
    createdAt,
    idle: false,
  };

  addSession(session);

  const ptyProcess = child as unknown as { on: (event: string, handler: (...args: unknown[]) => void) => void };
  ptyProcess.on('data', (...args: unknown[]) => {
    const chunk = args[0] as Buffer | string;
    handleSessionOutput(session, chunk);
  });
  ptyProcess.on('exit', (...args: unknown[]) => {
    const code = args[0] as number | null;
    const signal = args[1] as string | null;
    handleSessionExit(session, code || 0, signal || '');
  });
  session.readyTimer = resolveTerminalDependency('setTimeout')(() => {
    markSessionReady(session);
  }, 150);

  resolveTerminalDependency('emitSessionsUpdate')(serialiseSessions(listActiveSessions()));

  return session;
}

export async function getOrCreateTerminalSession(
  workdir: string,
  org: string,
  repo: string,
  branch: string,
  options: { mode?: string; forceNew?: boolean; tool?: SessionTool; kind?: SessionKind } = {}
) {
  const rawMode = typeof options['mode'] === 'string' ? options['mode'].toLowerCase() : 'auto';
  const mode = rawMode === 'tmux' || rawMode === 'pty' ? rawMode : 'auto';
  const allowTmuxSessions = mode !== 'pty';
  const allowPlainSessions = mode !== 'tmux';
  const requireTmux = mode === 'tmux';

  if (options.forceNew) {
    const requestedTool = options.tool === 'agent' ? 'agent' : 'terminal';
    const requestedKind: SessionKind = options.kind === 'automation' ? 'automation' : 'interactive';
    return createTerminalSession(workdir, org, repo, branch, {
      useTmux: allowTmuxSessions,
      kind: requestedKind,
      tool: requestedTool,
      requireTmux,
      forceUniqueTmux: true,
    });
  }

  const key = makeSessionKey(org, repo, branch);
  const bucket = getSessionBucket(key);
  let automationCandidate = null;
  if (bucket) {
    for (const session of bucket.values()) {
      if (!session || session.closed) {
        continue;
      }
      if (session.kind && session.kind !== 'interactive') {
        if (!automationCandidate && session.kind === 'automation') {
          automationCandidate = session;
        }
        continue;
      }
      const sessionUsesTmux = Boolean(session.usingTmux);
      if (!session.kind) {
        if (!sessionUsesTmux) {
          if (mode === 'pty') {
            return { session, created: false };
          }
          continue;
        }
        if (!allowTmuxSessions) {
          continue;
        }
        return { session, created: false };
      }
      if (session.kind === 'interactive') {
        if (sessionUsesTmux) {
          if (!allowTmuxSessions) {
            continue;
          }
          return { session, created: false };
        }
        if (!allowPlainSessions) {
          continue;
        }
        return { session, created: false };
      }
    }
  }
  if (automationCandidate) {
    return { session: automationCandidate, created: false };
  }
  if (allowTmuxSessions) {
    return createTerminalSession(workdir, org, repo, branch, {
      useTmux: true,
      kind: options.kind ?? 'interactive',
      tool: options.tool ?? 'terminal',
      requireTmux,
    });
  }
  return createTerminalSession(workdir, org, repo, branch, {
    useTmux: false,
    kind: options.kind ?? 'interactive',
    tool: options.tool ?? 'terminal',
  });
}

export async function createIsolatedTerminalSession(
  workdir: string,
  org: string,
  repo: string,
  branch: string
): Promise<TerminalSession> {
  return createTerminalSession(workdir, org, repo, branch, {
    useTmux: true,
    kind: 'automation',
    tool: 'agent',
  });
}
