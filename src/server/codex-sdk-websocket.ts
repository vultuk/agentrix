import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import type { WebSocket, WebSocketServer as WSServer } from 'ws';
import { WebSocketServer } from 'ws';

import type { AuthManager } from '../types/auth.js';
import { SESSION_COOKIE_NAME } from '../config/constants.js';
import { parseCookies } from '../utils/cookies.js';
import {
  getCodexSdkSession,
  getCodexSdkSessionEvents,
  sendCodexSdkUserMessage,
  subscribeToCodexSdkEvents,
} from '../core/codex-sdk-sessions.js';

export interface WebSocketAttachment {
  wss: WSServer;
  close: () => Promise<void>;
}

interface CodexWebSocketDependencies {
  WebSocketServer: typeof WebSocketServer;
  parseCookies: typeof parseCookies;
  getCodexSdkSession: typeof getCodexSdkSession;
  getCodexSdkSessionEvents: typeof getCodexSdkSessionEvents;
  sendCodexSdkUserMessage: typeof sendCodexSdkUserMessage;
  subscribeToCodexSdkEvents: typeof subscribeToCodexSdkEvents;
}

const defaultDependencies: CodexWebSocketDependencies = {
  WebSocketServer,
  parseCookies,
  getCodexSdkSession,
  getCodexSdkSessionEvents,
  sendCodexSdkUserMessage,
  subscribeToCodexSdkEvents,
};

let dependencyOverrides: Partial<CodexWebSocketDependencies> | null = null;

function getDependency<K extends keyof CodexWebSocketDependencies>(key: K): CodexWebSocketDependencies[K] {
  return (dependencyOverrides?.[key] ?? defaultDependencies[key]) as CodexWebSocketDependencies[K];
}

export function __setCodexWebSocketOverrides(overrides?: Partial<CodexWebSocketDependencies>): void {
  dependencyOverrides = overrides ?? null;
}

export function attachCodexSdkWebSockets(server: HttpServer, authManager: AuthManager): WebSocketAttachment {
  const WebSocketServerImpl = getDependency('WebSocketServer');
  const wss = new WebSocketServerImpl({ noServer: true });

  wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    const url = new URL(request.url || '', 'http://localhost');
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      socket.send(
        JSON.stringify({ type: 'error', message: 'sessionId query parameter is required (e.g., ?sessionId=<id>)' }),
      );
      socket.close();
      return;
    }

    const session = getDependency('getCodexSdkSession')(sessionId);
    if (!session) {
      socket.send(JSON.stringify({ type: 'error', message: 'Codex SDK session not found' }));
      socket.close();
      return;
    }

    const history = getDependency('getCodexSdkSessionEvents')(sessionId);
    try {
      socket.send(JSON.stringify({ type: 'history', events: history }));
    } catch {
      socket.close();
      return;
    }

    const unsubscribe = getDependency('subscribeToCodexSdkEvents')(sessionId, (event) => {
      try {
        socket.send(JSON.stringify({ type: 'event', event }));
      } catch {
        // Ignore send errors; connection lifecycle will handle cleanup.
      }
    });

    socket.on('message', async (data: string | Buffer) => {
      let payload: { type?: string; text?: string } | null = null;
      try {
        const raw = typeof data === 'string' ? data : data.toString('utf8');
        payload = JSON.parse(raw);
      } catch {
        payload = null;
      }
      if (!payload || payload.type !== 'message') {
        socket.send(JSON.stringify({ type: 'error', message: 'Unsupported payload' }));
        return;
      }
      try {
        await getDependency('sendCodexSdkUserMessage')(sessionId, payload.text || '');
      } catch (error: unknown) {
        const message =
          (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
            ? error.message
            : 'Codex SDK request failed');
        socket.send(JSON.stringify({ type: 'error', message }));
      }
    });

    socket.on('close', () => {
      unsubscribe();
    });

    socket.on('error', () => {
      unsubscribe();
      try {
        socket.close();
      } catch {
        // ignore socket close errors
      }
    });
  });

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname === '/api/terminal/socket') {
        return;
      }
      if (url.pathname !== '/api/codex-sdk/socket') {
        socket.destroy();
        return;
      }

      const cookies = getDependency('parseCookies')(req.headers.cookie);
      const token = cookies[SESSION_COOKIE_NAME] || '';
      if (!token || !authManager.hasToken(token)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } catch {
      socket.destroy();
    }
  });

  async function close(): Promise<void> {
    await new Promise<void>((resolve) => {
      try {
        wss.clients.forEach((client) => {
          try {
            client.close();
          } catch {
            // ignore individual client errors
          }
        });
        wss.close(() => resolve());
      } catch {
        resolve();
      }
    });
  }

  return { wss, close };
}
