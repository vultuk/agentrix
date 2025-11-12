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
import { persistSessionsSnapshot, loadPersistedSessionsSnapshot } from './session-persistence.js';

const IDLE_TIMEOUT_MS = 90 * 1000;
const IDLE_SWEEP_INTERVAL_MS = 5 * 1000;
const DEFAULT_UTF8_LOCALE = 'en_US.UTF-8';

interface TerminalSessionDependencies {
  spawnPty: typeof pty.spawn;
  getWorktreePath: typeof getWorktreePath;
  detectTmux: typeof detectTmux;
  isTmuxAvailable: typeof isTmuxAvailable;
  makeTmuxSessionName: typeof makeTmuxSessionName;
  tmuxHasSession: typeof tmuxHasSession;
  emitSessionsUpdate: typeof emitSessionsUpdate;
  persistSessionsSnapshot: typeof persistSessionsSnapshot;
  loadPersistedSessionsSnapshot: typeof loadPersistedSessionsSnapshot;
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
  persistSessionsSnapshot,
  loadPersistedSessionsSnapshot,
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

export function __resetTerminalSessionsState(): void {
  terminalSessions.clear();
  terminalSessionsById.clear();
  sessionLabelCounters.clear();
  stopIdleMonitorIfInactive();
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

let persistenceSuppressed = false;

function broadcastSessionsUpdate(
  snapshot?: WorktreeSessionSummary[],
  options: { persist?: boolean } = {},
): void {
  const payload = snapshot ?? serialiseSessions(listActiveSessions());
  resolveTerminalDependency('emitSessionsUpdate')(payload);
  if (options.persist === false || persistenceSuppressed) {
    return;
  }
  void resolveTerminalDependency('persistSessionsSnapshot')(payload).catch((error) => {
    console.warn('[agentrix] Failed to persist sessions snapshot:', error);
  });
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

function normaliseUtf8Candidate(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/utf-?8/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

function resolveUtf8Locale(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    const normalised = normaliseUtf8Candidate(candidate);
    if (normalised) {
      return normalised;
    }
  }
  return DEFAULT_UTF8_LOCALE;
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
    tmuxSessionName: typeof session.tmuxSessionName === 'string' ? session.tmuxSessionName : null,
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
  broadcastSessionsUpdate();
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

function markSessionReady(session: TerminalSession): boolean {
  if (!session || session.ready) {
    return false;
  }
  session.ready = true;
  if (session.readyTimer) {
    resolveTerminalDependency('clearTimeout')(session.readyTimer);
    session.readyTimer = null;
  }
  flushPendingInputs(session);
  const ptyProcess = (session.process || {}) as { cols?: number; rows?: number };
  broadcast(session, 'ready', {
    log: session.log || '',
    cols: typeof ptyProcess.cols === 'number' ? ptyProcess.cols : null,
    rows: typeof ptyProcess.rows === 'number' ? ptyProcess.rows : null,
  });
  return true;
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
    broadcastSessionsUpdate();
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

function broadcastBinary(session: TerminalSession, buffer: Buffer): void {
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
      socket.send(buffer, { binary: true });
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
  const buffer = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Buffer.from(chunk);
  broadcastBinary(session, buffer);
  if (becameActive) {
    broadcastSessionsUpdate();
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
    broadcastSessionsUpdate();
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
  broadcastSessionsUpdate();
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
  broadcastSessionsUpdate();
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
  broadcastSessionsUpdate();
}

export async function disposeSessionById(sessionId: string): Promise<void> {
  const session = terminalSessionsById.get(sessionId);
  if (!session) {
    return;
  }
  await terminateSession(session);
  broadcastSessionsUpdate();
}

export async function disposeAllSessions(): Promise<void> {
  const activeSessions = Array.from(terminalSessionsById.values());
  if (activeSessions.length === 0) {
    return;
  }
  persistenceSuppressed = true;
  try {
    const closures = activeSessions.map((session) =>
      terminateSession(session, { signal: 'SIGTERM', forceAfter: 0 }).catch(() => {}),
    );
    await Promise.allSettled(closures);
    terminalSessions.clear();
    terminalSessionsById.clear();
    stopIdleMonitorIfInactive();
  } finally {
    persistenceSuppressed = false;
  }
  broadcastSessionsUpdate([], { persist: false });
}

export function getSessionById(sessionId: string): TerminalSession | undefined {
  return terminalSessionsById.get(sessionId);
}

export function listActiveSessions(): TerminalSession[] {
  return Array.from(terminalSessionsById.values()).filter((session) => session && !session.closed);
}

export async function rehydrateTmuxSessionsFromSnapshot(
  workdir: string,
  options: { mode?: string } = {},
): Promise<void> {
  if (!workdir || terminalSessionsById.size > 0) {
    return;
  }
  const mode = typeof options.mode === 'string' ? options.mode.toLowerCase() : 'auto';
  if (mode === 'pty') {
    return;
  }
  let summaries: WorktreeSessionSummary[];
  try {
    summaries = await resolveTerminalDependency('loadPersistedSessionsSnapshot')();
  } catch (error) {
    console.warn('[agentrix] Failed to load persisted sessions snapshot for rehydration:', error);
    return;
  }
  if (!Array.isArray(summaries) || summaries.length === 0) {
    return;
  }

  try {
    await resolveTerminalDependency('detectTmux')();
  } catch (error) {
    console.warn('[agentrix] Failed to detect tmux during session rehydration:', error);
    return;
  }
  if (!resolveTerminalDependency('isTmuxAvailable')()) {
    return;
  }

  const tmuxHasSession = resolveTerminalDependency('tmuxHasSession');

  for (const summary of summaries) {
    if (!summary || !summary.sessions || !Array.isArray(summary.sessions)) {
      continue;
    }
    for (const snapshot of summary.sessions) {
      if (!snapshot || !snapshot.usingTmux) {
        continue;
      }
      const tmuxSessionName =
        typeof (snapshot as { tmuxSessionName?: string }).tmuxSessionName === 'string'
          ? (snapshot as { tmuxSessionName?: string }).tmuxSessionName
          : null;
      if (!tmuxSessionName) {
        continue;
      }
      try {
        const exists = await tmuxHasSession(tmuxSessionName);
        if (!exists) {
          continue;
        }
        const session = await createTerminalSession(workdir, summary.org, summary.repo, summary.branch, {
          useTmux: true,
          tool: snapshot.tool ?? 'terminal',
          kind: snapshot.kind ?? (snapshot.tool === 'agent' ? 'automation' : 'interactive'),
          tmuxSessionName,
          resumeFromTmux: true,
        });
        if (typeof snapshot.label === 'string' && snapshot.label.trim().length > 0) {
          session.label = snapshot.label;
        }
        if (typeof snapshot.lastActivityAt === 'string') {
          const parsed = Date.parse(snapshot.lastActivityAt);
          if (!Number.isNaN(parsed)) {
            session.lastActivityAt = parsed;
          }
        }
        if (typeof snapshot.createdAt === 'string') {
          const createdAtParsed = Date.parse(snapshot.createdAt);
          if (!Number.isNaN(createdAtParsed)) {
            session.createdAt = createdAtParsed;
          }
        }
        session.idle = Boolean(snapshot.idle);
      } catch (error) {
        console.warn(
          `[agentrix] Failed to rehydrate tmux session ${tmuxSessionName} for ${summary.org}/${summary.repo}:${summary.branch}:`,
          error,
        );
      }
    }
  }
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
  reattachOnly = false,
}: {
  workdir: string;
  org: string;
  repo: string;
  branch: string;
  useTmux?: boolean;
  requireTmux?: boolean;
  tmuxSessionNameOverride?: string | null;
  reattachOnly?: boolean;
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
  const termValue = typeof process.env['TERM'] === 'string' && process.env['TERM']!.trim().length > 0
    ? process.env['TERM']!.trim()
    : 'xterm-256color';
  const langValue = resolveUtf8Locale(process.env['LANG']);
  const lcAllValue = resolveUtf8Locale(process.env['LC_ALL'], langValue);
  const lcCtypeValue = resolveUtf8Locale(process.env['LC_CTYPE'], lcAllValue);
  const baseEnv: Record<string, string | undefined> = {
    ...process.env,
    TERM: termValue || 'xterm-256color',
    COLORTERM:
      typeof process.env['COLORTERM'] === 'string' && process.env['COLORTERM']!.trim().length > 0
        ? process.env['COLORTERM']!.trim()
        : 'truecolor',
    LANG: langValue,
    LC_ALL: lcAllValue,
    LC_CTYPE: lcCtypeValue,
    TERM_PROGRAM: process.env['TERM_PROGRAM'] || 'agentrix',
    TERM_PROGRAM_VERSION: process.env['TERM_PROGRAM_VERSION'] || '1.0',
    FORCE_COLOR: process.env['FORCE_COLOR'] || '1',
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
      if (reattachOnly && !tmuxSessionExists) {
        throw new Error(`tmux session ${tmuxSessionName} not found`);
      }

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
        encoding: 'utf8',
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
      encoding: 'utf8',
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
    tmuxSessionName?: string | null;
    resumeFromTmux?: boolean;
  } = {}
): Promise<TerminalSession> {
  const {
    useTmux = true,
    kind = 'interactive',
    tool,
    requireTmux = false,
    forceUniqueTmux = false,
    tmuxSessionName: tmuxSessionNameOverride,
    resumeFromTmux = false,
  } = options;
  const resolvedKind: SessionKind = kind === 'automation' ? 'automation' : 'interactive';
  const key = makeSessionKey(org, repo, branch);
  const resolvedTool: SessionTool = tool ?? (resolvedKind === 'automation' ? 'agent' : 'terminal');
  const label = allocateSessionLabel(key, resolvedTool);
  const createdAt = Date.now();
  const labelSlug = slugifyLabel(label) || 'session';
  let effectiveTmuxSessionName: string | undefined;
  if (typeof tmuxSessionNameOverride === 'string' && tmuxSessionNameOverride.trim().length > 0) {
    effectiveTmuxSessionName = tmuxSessionNameOverride.trim();
  } else if (useTmux && forceUniqueTmux) {
    effectiveTmuxSessionName = `${resolveTerminalDependency('makeTmuxSessionName')(org, repo, branch)}--${labelSlug}`;
  }
  const { child, usingTmux, tmuxSessionName, worktreePath } = await spawnTerminalProcess({
    workdir,
    org,
    repo,
    branch,
    useTmux,
    requireTmux,
    tmuxSessionNameOverride: effectiveTmuxSessionName,
    reattachOnly: resumeFromTmux,
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

  broadcastSessionsUpdate();

  return session;
}

export async function getOrCreateTerminalSession(
  workdir: string,
  org: string,
  repo: string,
  branch: string,
  options: { mode?: string; forceNew?: boolean; tool?: SessionTool; kind?: SessionKind } = {}
) {
  const requireTmux = true;

  if (options.forceNew) {
    const requestedTool = options.tool === 'agent' ? 'agent' : 'terminal';
    const requestedKind: SessionKind = options.kind === 'automation' ? 'automation' : 'interactive';
    return createTerminalSession(workdir, org, repo, branch, {
      useTmux: true,
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
      if (session.usingTmux) {
        return { session, created: false };
      }
    }
  }
  if (automationCandidate) {
    return { session: automationCandidate, created: false };
  }
  return createTerminalSession(workdir, org, repo, branch, {
    useTmux: true,
    kind: options.kind ?? 'interactive',
    tool: options.tool ?? 'terminal',
    requireTmux,
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
