import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import type { RequestContext } from '../types/http.js';
import {
    __setBaseHandlerTestOverrides,
    createHandler,
    createQueryHandler,
    createSimpleHandler,
} from './base-handler.js';

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    req: { headers: {} } as unknown as RequestContext['req'],
    res: {} as unknown as RequestContext['res'],
    url: new URL('http://localhost/test'),
    method: 'POST',
    workdir: '/tmp/workdir',
    readJsonBody: async () => ({}),
    ...overrides,
  };
}

describe('createHandler', () => {
  it('validates input, invokes handler, and sends transformed response', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const validator = mock.fn(() => ({ name: 'AGENTRIX' }));
    const handler = mock.fn(async (input: { name: string }) => {
      assert.deepEqual(input, { name: 'AGENTRIX' });
      return { ok: true };
    });

    const responseTransformer = mock.fn((result: { ok: boolean }) => ({ data: result.ok }));

    const context = createContext({
      readJsonBody: async () => ({ name: 'agentrix' }),
    });

    const handlerFn = createHandler({
      handler,
      validator,
      successCode: 201,
      responseTransformer,
    });

    await handlerFn(context);
    __setBaseHandlerTestOverrides();

    assert.equal(validator.mock.calls.length, 1);
    assert.equal(handler.mock.calls.length, 1);
    assert.equal(responseTransformer.mock.calls.length, 1);
    assert.equal(sendJson.mock.calls.length, 1);

    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 201);
    assert.deepEqual(call.arguments[2], { data: true });
  });

  it('skips reading the body when readBody is false and uses default transformer', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const readJsonBody = mock.fn(async () => ({}));
    const handler = mock.fn(async () => ({ ok: true }));

    const handlerFn = createHandler({
      handler,
      readBody: false,
    });

    const context = createContext({ readJsonBody });

    await handlerFn(context);
    __setBaseHandlerTestOverrides();

    assert.equal(readJsonBody.mock.calls.length, 0);
    assert.equal(handler.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    assert.deepEqual(call.arguments[2], { ok: true });
  });
});

describe('createSimpleHandler', () => {
  it('wraps handler without reading request body', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const handler = mock.fn(async () => ({ status: 'ok' }));
    const readJsonBody = mock.fn(async () => ({}));

    const simple = createSimpleHandler(handler, { successCode: 204 });

    const context = createContext({ readJsonBody });

    await simple(context);
    __setBaseHandlerTestOverrides();

    assert.equal(readJsonBody.mock.calls.length, 0);
    assert.equal(handler.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 204);
    assert.deepEqual(call.arguments[2], { status: 'ok' });
  });
});

describe('createQueryHandler', () => {
  it('invokes handler and sends response without validation', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const handler = mock.fn(async () => ({ count: 1 }));

    const queryHandler = createQueryHandler(handler, {
      successCode: 202,
      responseTransformer: (result) => ({ data: result.count }),
    });

    const context = createContext({ method: 'GET' });

    await queryHandler(context);
    __setBaseHandlerTestOverrides();

    assert.equal(handler.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 202);
    assert.deepEqual(call.arguments[2], { data: 1 });
  });
});

