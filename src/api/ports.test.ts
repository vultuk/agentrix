import assert from 'node:assert/strict';
import { describe, it, mock, beforeEach, afterEach } from 'node:test';

import { createPortHandlers, __setPortsApiTestOverrides } from './ports.js';
import { __setBaseHandlerTestOverrides } from './base-handler.js';
import type { RequestContext } from '../types/http.js';

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const url = new URL('http://localhost/api/ports');
  const defaultContext: RequestContext = {
    req: { headers: {} } as never,
    res: {
      statusCode: 0,
      setHeader: mock.fn(),
      getHeader: mock.fn(),
      end: mock.fn(),
    } as never,
    url,
    method: 'GET',
    workdir: '/workspace',
    readJsonBody: async () => ({}),
  };
  return { ...defaultContext, ...overrides };
}

describe('createPortHandlers', () => {
  beforeEach(() => {
    __setPortsApiTestOverrides();
  });

  afterEach(() => {
    __setPortsApiTestOverrides();
    __setBaseHandlerTestOverrides();
  });

  it('throws when port manager is missing', () => {
    assert.throws(
      () => createPortHandlers({ portManager: undefined as never }),
      /portManager is required/,
    );
  });

  it('lists active ports and disables caching', async () => {
    const sendJson = mock.fn();
    const listPorts = mock.fn(async () => [3000, 5000]);
    const setHeaderMock = mock.fn();

    __setBaseHandlerTestOverrides({ sendJson });
    __setPortsApiTestOverrides({ listActivePorts: listPorts });

    const handlers = createPortHandlers({
      portManager: {
        open: async () => ({ port: 0, url: '', createdAt: 0 }),
        close: async () => {},
        closeAll: async () => {},
        list: () => [],
      },
    });

    const context = createContext({
      res: {
        statusCode: 0,
        setHeader: setHeaderMock,
        getHeader: mock.fn(),
        end: mock.fn(),
      } as never,
    });

    await handlers.list(context);

    assert.equal(listPorts.mock.callCount(), 1);
    assert.equal(setHeaderMock.mock.callCount(), 1);
    const call = setHeaderMock.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[0], 'Cache-Control');
    assert.equal(call.arguments[1], 'no-store');

    assert.equal(sendJson.mock.callCount(), 1);
    const sendCall = sendJson.mock.calls[0];
    assert.ok(sendCall);
    assert.equal(sendCall.arguments[1], 200);
    assert.deepEqual(sendCall.arguments[2], { ports: [3000, 5000] });
  });

  it('validates tunnel creation payload', async () => {
    const endMock = mock.fn();
    const context = createContext({
      method: 'POST',
      res: {
        statusCode: 0,
        setHeader: mock.fn(),
        getHeader: mock.fn(),
        end: endMock,
      } as never,
      readJsonBody: async () => ({ port: 'invalid' }),
    });

    const handlers = createPortHandlers({
      portManager: {
        open: async () => ({ port: 0, url: '', createdAt: 0 }),
        close: async () => {},
        closeAll: async () => {},
        list: () => [],
      },
    });

    await handlers.openTunnel(context);

    assert.equal(context.res.statusCode, 400);
    assert.equal(endMock.mock.callCount(), 1);
    const payload = endMock.mock.calls[0]?.arguments?.[0];
    assert.ok(typeof payload === 'string');
    const parsed = JSON.parse(payload as string);
    assert.match(parsed.error, /Port must be an integer/);
  });

  it('opens tunnels via port manager', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const openMock = mock.fn(async (port: number) => ({
      port,
      url: `https://localhost:${port}`,
      createdAt: 123,
    }));

    const handlers = createPortHandlers({
      portManager: {
        open: openMock,
        close: async () => {},
        closeAll: async () => {},
        list: () => [],
      },
    });

    const context = createContext({
      method: 'POST',
      readJsonBody: async () => ({ port: 7000 }),
    });

    await handlers.openTunnel(context);

    assert.equal(openMock.mock.callCount(), 1);
    assert.deepEqual(openMock.mock.calls[0]?.arguments, [7000]);

    assert.equal(sendJson.mock.callCount(), 1);
    const payload = sendJson.mock.calls[0];
    assert.ok(payload);
    assert.equal(payload.arguments[1], 201);
    assert.deepEqual(payload.arguments[2], {
      tunnel: {
        port: 7000,
        url: 'https://localhost:7000',
        createdAt: 123,
      },
    });
  });
});
