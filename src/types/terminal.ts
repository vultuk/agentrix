import type { IPty } from 'node-pty';
import type { WebSocket } from 'ws';

/**
 * Terminal session kind
 */
export type SessionKind = 'interactive' | 'automation';

export type SessionTool = 'terminal' | 'agent';

/**
 * Terminal session mode
 */
export type TerminalSessionMode = 'auto' | 'tmux' | 'pty';

/**
 * Socket watcher interface
 */
export interface SocketWatcher {
  socket: WebSocket;
}

/**
 * Terminal session interface
 */
export interface TerminalSession {
  id: string;
  key: string;
  org: string;
  repo: string;
  branch: string;
  process: IPty;
  worktreePath: string;
  usingTmux: boolean;
  tmuxSessionName: string | null;
  log: string;
  watchers: Set<SocketWatcher>;
  closed: boolean;
  waiters: Array<() => void>;
  pendingInputs: string[];
  ready: boolean;
  readyTimer: NodeJS.Timeout | null;
  kind: SessionKind;
  tool: SessionTool;
  label: string;
  lastActivityAt: number | Date;
  createdAt: number | Date;
  idle: boolean;
  exitCode?: number;
  exitSignal?: string;
  exitError?: string;
}

/**
 * Terminal session options
 */
export interface TerminalSessionOptions {
  mode?: TerminalSessionMode;
  useTmux?: boolean;
  kind?: SessionKind;
  requireTmux?: boolean;
}

/**
 * Session creation result
 */
export interface SessionCreationResult {
  session: TerminalSession;
  created: boolean;
}

export interface TerminalSessionSnapshot {
  id: string;
  label: string;
  kind: SessionKind;
  tool: SessionTool;
  idle: boolean;
  usingTmux: boolean;
  lastActivityAt: string | null;
  createdAt: string | null;
}

export interface WorktreeSessionSummary {
  org: string;
  repo: string;
  branch: string;
  idle: boolean;
  lastActivityAt: string | null;
  sessions: TerminalSessionSnapshot[];
}
