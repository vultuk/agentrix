import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { createTerminalHandlers } from './terminal.js';
import { __setBaseHandlerTestOverrides } from './base-handler.js';
import type { RequestContext } from '../types/http.js';
import type { TerminalService } from '../services/terminal-service.js';

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const url = new URL('http://localhost/api/terminal');
  if (overrides.url) {
    Object.assign(url, overrides.url);
  }

  return {
    req: { headers: {} } as unknown as RequestContext['req'],
    res: {
      statusCode: 0,
      setHeader: mock.fn(),
      getHeader: mock.fn(),
      end: mock.fn(),
    } as unknown as RequestContext['res'],
    url,
    method: 'POST',
    workdir: '/tmp/workdir',
    readJsonBody: async () => ({}),
    ...overrides,
  };
}

describe('createTerminalHandlers', () => {
  it('open handler validates input and invokes terminal service', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const terminalService = {
      openTerminal: mock.fn(async () => ({ sessionId: 'abc', log: 'ready', closed: false, created: true })),
      sendInput: mock.fn(),
      closeSession: mock.fn(),
    } as unknown as TerminalService;

    const handlers = createTerminalHandlers('/workdir', { terminalService });

    const context = createContext({
      readJsonBody: async () => ({
        org: 'vultuk',
        repo: 'agentrix',
        branch: 'feature/demo',
        command: 'npm test',
      }),
    });

    await handlers.open(context);
    __setBaseHandlerTestOverrides();

    assert.equal(terminalService.openTerminal.mock.calls.length, 1);
    const callArgs = terminalService.openTerminal.mock.calls[0]?.arguments[0];
    assert.ok(callArgs);
    assert.equal(callArgs.org, 'vultuk');
    assert.equal(callArgs.branch, 'feature/demo');
    assert.equal(callArgs.command, 'npm test');
    assert.equal(callArgs.hasPrompt, false);

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    assert.deepEqual(call.arguments[2], {
      sessionId: 'abc',
      log: 'ready',
      closed: false,
      created: true,
    });
  });

  it('send handler validates input and forwards to terminal service', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const terminalService = {
      openTerminal: mock.fn(),
      sendInput: mock.fn(async () => ({ ok: true })),
      closeSession: mock.fn(),
    } as unknown as TerminalService;

    const handlers = createTerminalHandlers('/workdir', { terminalService });

    const context = createContext({
      readJsonBody: async () => ({
        sessionId: 'session-123',
        input: 'ls',
      }),
    });

    await handlers.send(context);
    __setBaseHandlerTestOverrides();

    assert.equal(terminalService.sendInput.mock.calls.length, 1);
    const callArgs = terminalService.sendInput.mock.calls[0]?.arguments[0];
    assert.ok(callArgs);
    assert.equal(callArgs.sessionId, 'session-123');
    assert.equal(callArgs.input, 'ls');

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    assert.deepEqual(call.arguments[2], { ok: true });
  });

  it('close handler terminates sessions', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const terminalService = {
      openTerminal: mock.fn(),
      sendInput: mock.fn(),
      closeSession: mock.fn(async () => ({ ok: true })),
    } as unknown as TerminalService;

    const handlers = createTerminalHandlers('/workdir', { terminalService });

    const context = createContext({
      readJsonBody: async () => ({ sessionId: 'session-42' }),
    });

    await handlers.close(context);
    __setBaseHandlerTestOverrides();

    assert.equal(terminalService.closeSession.mock.calls.length, 1);
    const payload = terminalService.closeSession.mock.calls[0]?.arguments[0];
    assert.ok(payload);
    assert.equal(payload.sessionId, 'session-42');

    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    assert.deepEqual(call.arguments[2], { ok: true });
  });

  it('open handler rejects main branch requests', async () => {
    const terminalService = {
      openTerminal: mock.fn(),
      sendInput: mock.fn(),
    } as unknown as TerminalService;

    const handlers = createTerminalHandlers('/workdir', { terminalService });

    const context = createContext({
      readJsonBody: async () => ({
        org: 'vultuk',
        repo: 'agentrix',
        branch: 'main',
        command: 'npm test',
      }),
    });

    await handlers.open(context);
    __setBaseHandlerTestOverrides();

    assert.equal(terminalService.openTerminal.mock.calls.length, 0);
    assert.equal(context.res.statusCode, 400);
    const endCalls = (context.res.end as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok(endCalls.length > 0);
    const errorCall = endCalls.find((call) => {
      const arg = call.arguments[0];
      return typeof arg === 'string' && arg.includes('error');
    });
    assert.ok(errorCall);
    assert.match(errorCall.arguments[0] as string, /main branch is disabled/i);
  });

  it('send handler validates required sessionId', async () => {
    const terminalService = {
      openTerminal: mock.fn(),
      sendInput: mock.fn(),
    } as unknown as TerminalService;

    const handlers = createTerminalHandlers('/workdir', { terminalService });

    const context = createContext({
      readJsonBody: async () => ({
        sessionId: '',
        input: 'echo',
      }),
    });

    await handlers.send(context);
    __setBaseHandlerTestOverrides();

    assert.equal(terminalService.sendInput.mock.calls.length, 0);
    assert.equal(context.res.statusCode, 400);
    const endCalls = (context.res.end as ReturnType<typeof mock.fn>).mock.calls;
    assert.ok(endCalls.length > 0);
    const errorCall = endCalls.find((call) => {
      const arg = call.arguments[0];
      return typeof arg === 'string' && arg.includes('error');
    });
    assert.ok(errorCall);
    assert.match(errorCall.arguments[0] as string, /sessionId is required/i);
  });
});
