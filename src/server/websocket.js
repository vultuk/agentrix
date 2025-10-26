import { WebSocketServer } from 'ws';

import { SESSION_COOKIE_NAME } from '../config/constants.js';
import { parseCookies } from '../utils/cookies.js';
import { addSocketWatcher, getSessionById } from '../core/terminal-sessions.js';

export function attachTerminalWebSockets(server, authManager) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (socket, request) => {
    try {
      const url = new URL(request.url || '', 'http://localhost');
      const sessionId = url.searchParams.get('sessionId');
      if (!sessionId) {
        socket.send(JSON.stringify({ type: 'error', message: 'sessionId is required' }));
        socket.close();
        return;
      }

      const session = getSessionById(sessionId);
      if (!session) {
        socket.send(JSON.stringify({ type: 'error', message: 'Terminal session not found' }));
        socket.close();
        return;
      }

      addSocketWatcher(session, socket);

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
          session.process.write(payload);
        } else if (parsed && parsed.type === 'resize') {
          const cols = Number.parseInt(parsed.cols, 10);
          const rows = Number.parseInt(parsed.rows, 10);
          if (Number.isInteger(cols) && Number.isInteger(rows) && cols > 0 && rows > 0) {
            session.process.resize(cols, rows);
          }
        } else {
          session.process.write(raw);
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
        }),
      );
      if (session.closed) {
        socket.send(
          JSON.stringify({
            type: 'exit',
            code: session.exitCode,
            signal: session.exitSignal,
            error: session.exitError,
          }),
        );
        socket.close();
      }
    } catch (error) {
      socket.send(JSON.stringify({ type: 'error', message: error.message }));
      socket.close();
    }
  });

  server.on('upgrade', (req, socket, head) => {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/api/terminal/socket') {
        socket.destroy();
        return;
      }

      const cookies = parseCookies(req.headers.cookie);
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

  function close() {
    return new Promise((resolve) => {
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
