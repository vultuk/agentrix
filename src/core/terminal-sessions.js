import { randomUUID } from 'node:crypto';

import pty from 'node-pty';

import { MAX_TERMINAL_BUFFER, TMUX_BIN } from '../config/constants.js';
import { getWorktreePath } from './git.js';
import { detectTmux, isTmuxAvailable, makeTmuxSessionName, tmuxHasSession } from './tmux.js';
import { emitSessionsUpdate } from './event-bus.js';

const terminalSessions = new Map();
const terminalSessionsById = new Map();

function normaliseSessionInput(input) {
  if (typeof input === 'string') {
    return input;
  }
  if (Buffer.isBuffer(input)) {
    return input.toString('utf8');
  }
  return '';
}

function flushPendingInputs(session) {
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

function markSessionReady(session) {
  if (!session || session.ready) {
    return;
  }
  session.ready = true;
  if (session.readyTimer) {
    clearTimeout(session.readyTimer);
    session.readyTimer = null;
  }
  flushPendingInputs(session);
}

export function queueSessionInput(session, input) {
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
  if (session.ready) {
    try {
      session.process.write(value);
    } catch {
      // ignore write errors
    }
    return;
  }
  session.pendingInputs.push(value);
}

function trimLogBuffer(log) {
  if (log.length <= MAX_TERMINAL_BUFFER) {
    return log;
  }
  return log.slice(log.length - MAX_TERMINAL_BUFFER);
}

function broadcast(session, event, payload) {
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

function handleSessionOutput(session, chunk) {
  markSessionReady(session);
  const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  session.log = trimLogBuffer((session.log || '') + text);
  broadcast(session, 'output', { chunk: text });
}

function serialiseSessions(sessions) {
  return sessions.map((session) => ({
    id: session.id,
    org: session.org,
    repo: session.repo,
    branch: session.branch,
    usingTmux: session.usingTmux,
  }));
}

function handleSessionExit(session, code, signal, error) {
  if (session.closed) {
    return;
  }
  session.closed = true;
  session.exitCode = code;
  session.exitSignal = signal;
  session.exitError = error ? error.message : undefined;
  if (session.readyTimer) {
    clearTimeout(session.readyTimer);
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
  terminalSessions.delete(session.key);
  terminalSessionsById.delete(session.id);
  if (session.waiters) {
    session.waiters.forEach((resolve) => resolve());
    session.waiters = [];
  }
  emitSessionsUpdate(serialiseSessions(listActiveSessions()));
}

export function makeSessionKey(org, repo, branch) {
  return `${org}::${repo}::${branch}`;
}

function determineShellArgs(shellCommand) {
  if (!shellCommand) {
    return [];
  }
  const name = shellCommand.split('/').pop();
  if (name === 'bash' || name === 'zsh' || name === 'fish') {
    return ['-il'];
  }
  return [];
}

async function terminateSession(session, options = {}) {
  if (!session || session.closed) {
    return;
  }

  await new Promise((resolve) => {
    session.waiters = session.waiters || [];
    session.waiters.push(resolve);
    try {
      session.process.kill(options.signal || 'SIGTERM');
    } catch {
      resolve();
      return;
    }
    setTimeout(() => {
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

export async function disposeSessionByKey(key) {
  const session = terminalSessions.get(key);
  if (!session) {
    return;
  }
  await terminateSession(session);
  emitSessionsUpdate(serialiseSessions(listActiveSessions()));
}

export async function disposeSessionsForRepository(org, repo) {
  if (!org || !repo) {
    return;
  }
  const tasks = [];
  terminalSessions.forEach((session) => {
    if (!session || session.closed) {
      return;
    }
    if (session.org === org && session.repo === repo) {
      tasks.push(terminateSession(session).catch(() => {}));
    }
  });
  if (tasks.length === 0) {
    return;
  }
  await Promise.allSettled(tasks);
  emitSessionsUpdate(serialiseSessions(listActiveSessions()));
}

export async function disposeSessionById(sessionId) {
  const session = terminalSessionsById.get(sessionId);
  if (!session) {
    return;
  }
  await terminateSession(session);
  emitSessionsUpdate(serialiseSessions(listActiveSessions()));
}

export async function disposeAllSessions() {
  const closures = Array.from(terminalSessions.values()).map((session) =>
    terminateSession(session, { signal: 'SIGTERM', forceAfter: 0 }).catch(() => {}),
  );
  await Promise.allSettled(closures);
  terminalSessions.clear();
  terminalSessionsById.clear();
  emitSessionsUpdate([]);
}

export function getSessionById(sessionId) {
  return terminalSessionsById.get(sessionId);
}

export function listActiveSessions() {
  return Array.from(terminalSessions.values());
}

export function addSocketWatcher(session, socket) {
  const watcher = { socket };
  session.watchers.add(watcher);
  socket.on('close', () => {
    session.watchers.delete(watcher);
  });
}

export async function getOrCreateTerminalSession(workdir, org, repo, branch) {
  const key = makeSessionKey(org, repo, branch);
  let session = terminalSessions.get(key);
  if (session && !session.closed) {
    return { session, created: false };
  }
  if (session && session.closed) {
    terminalSessions.delete(key);
    terminalSessionsById.delete(session.id);
  }

  const { worktreePath } = await getWorktreePath(workdir, org, repo, branch);

  const shellCommand = process.env.SHELL || '/bin/bash';
  const args = determineShellArgs(shellCommand);

  let child;
  let usingTmux = false;
  let tmuxSessionName = null;
  let tmuxSessionExists = false;

  await detectTmux();
  if (isTmuxAvailable()) {
    tmuxSessionName = makeTmuxSessionName(org, repo, branch);
    tmuxSessionExists = await tmuxHasSession(tmuxSessionName);
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

    child = pty.spawn(process.env.TMUX || TMUX_BIN, tmuxArgs, {
      cwd: worktreePath,
      env: {
        ...process.env,
        TERM: process.env.TERM || 'xterm-256color',
      },
      cols: 120,
      rows: 36,
    });
    usingTmux = true;
  } else {
    child = pty.spawn(shellCommand, args, {
      cwd: worktreePath,
      env: {
        ...process.env,
        TERM: process.env.TERM || 'xterm-256color',
      },
      cols: 120,
      rows: 36,
    });
  }

  session = {
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
  };

  terminalSessions.set(key, session);
  terminalSessionsById.set(session.id, session);

  child.on('data', (chunk) => handleSessionOutput(session, chunk));
  child.on('exit', (code, signal) => handleSessionExit(session, code, signal));
  session.readyTimer = setTimeout(() => {
    markSessionReady(session);
  }, 150);

  emitSessionsUpdate(serialiseSessions(listActiveSessions()));

  const created = usingTmux ? !tmuxSessionExists : true;
  return { session, created };
}
