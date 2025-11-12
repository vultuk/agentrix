import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';

import { attachTerminalWebSockets, __setWebSocketTestOverrides } from './websocket.js';
import { SESSION_COOKIE_NAME } from '../config/constants.js';
import type { AuthManager } from '../types/auth.js';

class FakeWebSocket extends EventEmitter {
  public sent: Array<string | Buffer> = [];
  public closed = false;

  send(data: string | Buffer, _options?: unknown): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.emit('close');
  }
}

class FakeSocket extends EventEmitter {
  public destroyed = false;
  public writes: string[] = [];

  write(data: string): void {
    this.writes.push(data);
  }

  destroy(): void {
    this.destroyed = true;
  }
}

class FakeWebSocketServer extends EventEmitter {
  public clients = new Set<FakeWebSocket>();
  public closed = false;

  constructor() {
    super();
  }

  handleUpgrade(
    request: unknown,
    socket: unknown,
    head: unknown,
    callback: (ws: FakeWebSocket) => void,
  ): void {
    const ws = new FakeWebSocket();
    this.clients.add(ws);
    callback(ws);
  }

  close(callback: () => void): void {
    this.closed = true;
    this.clients.forEach((client) => {
      try {
        client.close();
      } catch {
        // ignore client close errors
      }
    });
    callback();
  }
}

function createAuthManager(hasToken: boolean): AuthManager {
  return {
    hasToken: mock.fn(() => hasToken),
    isAuthenticated: mock.fn(),
    addToken: mock.fn(),
    clear: mock.fn(),
    removeToken: mock.fn(),
    verifyToken: mock.fn(),
    createSessionCookie: mock.fn(),
  };
}

describe('attachTerminalWebSockets', () => {
  const overrides = {
    WebSocketServer: FakeWebSocketServer,
    parseCookies: (header: string | undefined) => {
      if (!header) {
        return {};
      }
      return Object.fromEntries(
        header.split(';').map((part) => {
          const [key, value] = part.trim().split('=');
          return [key, value];
        }),
      );
    },
    getSessionById: mock.fn(),
    addSocketWatcher: mock.fn(),
    queueSessionInput: mock.fn(),
  };

  beforeEach(() => {
    overrides.getSessionById.mock.resetCalls();
    overrides.addSocketWatcher.mock.resetCalls();
    overrides.queueSessionInput.mock.resetCalls();
    __setWebSocketTestOverrides(overrides);
  });

  afterEach(() => {
    __setWebSocketTestOverrides();
  });

  it('ignores upgrade requests for unrelated paths', async () => {
    const server = new EventEmitter() as unknown as { on: EventEmitter['on'] };
    const authManager = createAuthManager(true);
    attachTerminalWebSockets(server as never, authManager);

    const socket = new FakeSocket();
    (server as EventEmitter).emit(
      'upgrade',
      { url: '/other', headers: { host: 'localhost' } } as unknown,
      socket as unknown,
      Buffer.alloc(0),
    );

    assert.equal(socket.destroyed, true);
    assert.equal(overrides.getSessionById.mock.calls.length, 0);
  });

  it('rejects clients without valid session token', () => {
    const server = new EventEmitter() as unknown as { on: EventEmitter['on'] };
    const authManager = createAuthManager(false);
    attachTerminalWebSockets(server as never, authManager);

    const socket = new FakeSocket();
    (server as EventEmitter).emit(
      'upgrade',
      { url: '/api/terminal/socket', headers: { cookie: '' } } as unknown,
      socket as unknown,
      Buffer.alloc(0),
    );

    assert.equal(socket.destroyed, true);
    assert.equal(socket.writes.includes('HTTP/1.1 401 Unauthorized\r\n\r\n'), true);
  });

  it('notifies client when terminal session missing', () => {
    overrides.getSessionById.mock.mockImplementation(() => null);
    const server = new EventEmitter() as unknown as { on: EventEmitter['on'] };
    const authManager = createAuthManager(true);
    const attachment = attachTerminalWebSockets(server as never, authManager);

    const socket = new FakeSocket();
    (server as EventEmitter).emit(
      'upgrade',
      {
        url: '/api/terminal/socket?sessionId=missing',
        headers: {
          host: 'localhost',
          cookie: `${SESSION_COOKIE_NAME}=token`,
        },
      } as unknown,
      socket as unknown,
      Buffer.alloc(0),
    );

    const wsServer = attachment.wss as unknown as FakeWebSocketServer;
    const client = Array.from(wsServer.clients)[0]!;
    assert.equal(client.sent.some((message) => String(message).includes('Terminal session not found')), true);
    assert.equal(client.closed, true);
  });

  it('wires socket events for live sessions and queues inputs', async () => {
    const session = {
      id: 'session-1',
      log: 'hello',
      closed: false,
      exitCode: null,
      exitSignal: null,
      exitError: null,
      process: {
        resize: mock.fn(),
      },
    };
    overrides.getSessionById.mock.mockImplementation(() => session);

    const server = new EventEmitter() as unknown as { on: EventEmitter['on'] };
    const authManager = createAuthManager(true);
    const attachment = attachTerminalWebSockets(server as never, authManager);

    const socket = new FakeSocket();
    (server as EventEmitter).emit(
      'upgrade',
      {
        url: '/api/terminal/socket?sessionId=session-1',
        headers: {
          host: 'localhost',
          cookie: `${SESSION_COOKIE_NAME}=token`,
        },
      } as unknown,
      socket as unknown,
      Buffer.alloc(0),
    );

    const wsServer = attachment.wss as unknown as FakeWebSocketServer;
    const client = Array.from(wsServer.clients)[0]!;

    assert.equal(overrides.addSocketWatcher.mock.calls.length, 1);
    assert.equal(overrides.addSocketWatcher.mock.calls[0]?.arguments[0], session);
    assert.equal(client.sent.some((message) => String(message).includes('"type":"init"')), true);

    client.emit('message', Buffer.from('ls'), true);
    client.emit('message', '{"type":"resize","cols":"80","rows":"24"}', false);
    client.emit('message', '{"type":"resize","cols":"bad","rows":"0"}', false);
    client.emit('message', 'raw-bytes', false);
    client.emit('message', '{"type":"input"}', false);

    assert.equal(overrides.queueSessionInput.mock.calls.length, 3);
    assert.equal(Buffer.isBuffer(overrides.queueSessionInput.mock.calls[0]?.arguments?.[1]), true);
    assert.equal(
      overrides.queueSessionInput.mock.calls.some((call) => call?.arguments?.[1] === 'raw-bytes'),
      true,
    );
    assert.equal(
      overrides.queueSessionInput.mock.calls.some((call) => call?.arguments?.[1] === ''),
      true,
    );
    assert.equal(session.process.resize.mock.calls.length, 1);
    assert.deepEqual(session.process.resize.mock.calls[0]?.arguments, [80, 24]);

    client.emit('error', new Error('boom'));
    assert.equal(client.closed, true);

    await attachment.close();
    assert.equal(wsServer.closed, true);
  });
});
