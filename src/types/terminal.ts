import type { IPty } from 'node-pty';
import type { WebSocket } from 'ws';

/**
 * Terminal session kind
 */
export type SessionKind = 'interactive' | 'automation';

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
  lastActivityAt: number | Date;
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

