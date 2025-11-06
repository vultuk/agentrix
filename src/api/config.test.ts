import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { createConfigHandlers } from './config.js';
import { __setBaseHandlerTestOverrides } from './base-handler.js';
import type { RequestContext } from '../types/http.js';

function createContext(): RequestContext {
  return {
    req: { headers: {} } as unknown as RequestContext['req'],
    res: {
      statusCode: 0,
      setHeader: mock.fn(),
      getHeader: mock.fn(),
      end: mock.fn(),
    } as unknown as RequestContext['res'],
    url: new URL('http://localhost/api/config'),
    method: 'GET',
    workdir: '/tmp/workdir',
    readJsonBody: async () => ({}),
  };
}

describe('createConfigHandlers', () => {
  it('returns resolved agent commands', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const agentCommands = {
      codex: 'codex',
      codexDangerous: 'codex-dangerous',
      claude: 'claude',
      claudeDangerous: 'claude-dangerous',
      cursor: 'cursor',
      vscode: 'vscode',
    };

    const handlers = createConfigHandlers(agentCommands);
    const context = createContext();

    await handlers.commands(context);
    __setBaseHandlerTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    assert.deepEqual(call.arguments[2], {
      commands: {
        codex: 'codex',
        codexDangerous: 'codex-dangerous',
        claude: 'claude',
        claudeDangerous: 'claude-dangerous',
        cursor: 'cursor',
        vscode: 'vscode',
      },
    });
  });

  it('uses empty strings for missing command values', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const handlers = createConfigHandlers({});
    const context = createContext();

    await handlers.commands(context);
    __setBaseHandlerTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.deepEqual(call.arguments[2], {
      commands: {
        codex: '',
        codexDangerous: '',
        claude: '',
        claudeDangerous: '',
        cursor: '',
        vscode: '',
      },
    });
  });

  it('handles partial command configuration', async () => {
    const sendJson = mock.fn();
    __setBaseHandlerTestOverrides({ sendJson });

    const handlers = createConfigHandlers({
      codex: 'custom-codex',
      cursor: 'custom-cursor',
    });
    const context = createContext();

    await handlers.commands(context);
    __setBaseHandlerTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    const result = call.arguments[2] as { commands: Record<string, string> };
    assert.equal(result.commands.codex, 'custom-codex');
    assert.equal(result.commands.cursor, 'custom-cursor');
    assert.equal(result.commands.claude, '');
    assert.equal(result.commands.codexDangerous, '');
  });
});

