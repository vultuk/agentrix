import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import type { WebSocket, WebSocketServer as WSServer } from 'ws';
import { WebSocketServer } from 'ws';
import type { AuthManager } from '../types/auth.js';

import { SESSION_COOKIE_NAME } from '../config/constants.js';
import { parseCookies } from '../utils/cookies.js';
import {
  addSocketWatcher,
  getSessionById,
  queueSessionInput,
} from '../core/terminal-sessions.js';

export interface WebSocketAttachment {
  wss: WSServer;
  close: () => Promise<void>;
}

interface WebSocketDependencies {
  WebSocketServer: typeof WebSocketServer;
  parseCookies: typeof parseCookies;
  getSessionById: typeof getSessionById;
  addSocketWatcher: typeof addSocketWatcher;
  queueSessionInput: typeof queueSessionInput;
}

const defaultDependencies: WebSocketDependencies = {
  WebSocketServer,
  parseCookies,
  getSessionById,
  addSocketWatcher,
  queueSessionInput,
};

let testOverrides: Partial<WebSocketDependencies> | null = null;

export function __setWebSocketTestOverrides(overrides?: Partial<WebSocketDependencies>): void {
  testOverrides = overrides ?? null;
}

function getDependency<K extends keyof WebSocketDependencies>(key: K): WebSocketDependencies[K] {
  return (testOverrides?.[key] ?? defaultDependencies[key]) as WebSocketDependencies[K];
}

export function attachTerminalWebSockets(server: HttpServer, authManager: AuthManager): WebSocketAttachment {
  const WebSocketServerImpl = getDependency('WebSocketServer');
  const wss = new WebSocketServerImpl({ noServer: true });

  wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
    try {
      const url = new URL(request.url || '', 'http://localhost');
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        socket.send(JSON.stringify({ type: 'error', message: 'sessionId is required' }));
        socket.close();
        return;
      }

      const session = getDependency('getSessionById')(sessionId);
      if (!session) {
        socket.send(JSON.stringify({ type: 'error', message: 'Terminal session not found' }));
        socket.close();
        return;
      }

      getDependency('addSocketWatcher')(session, socket);

      socket.on('message', (data) => {
        if (session.closed) {
          return;
        }
        const raw = typeof data === 'string' ? data : data.toString('utf8');
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = null;
        }

        if (parsed && parsed.type === 'input') {
          const payload = typeof parsed.data === 'string' ? parsed.data : '';
          getDependency('queueSessionInput')(session, payload);
        } else if (parsed && parsed.type === 'resize') {
          const cols = Number.parseInt(parsed.cols, 10);
          const rows = Number.parseInt(parsed.rows, 10);
          if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0) {
            session.process.resize(cols, rows);
          }
        } else {
          getDependency('queueSessionInput')(session, raw);
        }
      });

      socket.on('error', () => {
        socket.close();
      });

      socket.send(
        JSON.stringify({
          type: 'init',
          log: session.log || '',
          closed: Boolean(session.closed),
        })
      );
      if (session.closed) {
        socket.send(
          JSON.stringify({
            type: 'exit',
            code: session.exitCode,
            signal: session.exitSignal,
            error: session.exitError,
          })
        );
        socket.close();
      }
    } catch (error: unknown) {
      const err = error as { message?: string };
      socket.send(JSON.stringify({ type: 'error', message: err.message }));
      socket.close();
    }
  });

  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/api/terminal/socket') {
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

  function close(): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        wss.clients.forEach((client) => {
          try {
            client.close();
          } catch {
            // ignore
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
