import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { __setServerStarterTestOverrides, startAppServer } from './server-starter.js';

describe('server starter', () => {
  it('starts the server, prints generated password, and registers shutdown handlers', async () => {
    const startServerMock = mock.fn(async () => ({
      server: {},
      host: '0.0.0.0',
      port: 8080,
      uiPath: '/tmp/ui',
      close: mock.fn(async () => {}),
      password: null,
      publicUrl: 'https://example.ngrok.app',
    }));

    const stdout: string[] = [];
    const stdoutMock = mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
      stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });

    const onCalls: Array<{ signal: string; handler: (...args: unknown[]) => void }> = [];
    const onMock = mock.method(process, 'on', (signal: string, handler: (...args: unknown[]) => void) => {
      onCalls.push({ signal, handler });
      return process;
    });

    __setServerStarterTestOverrides({
      startServer: startServerMock,
      generateRandomPassword: () => 'generated-pass',
    });

    try {
      await startAppServer({
        uiPath: './ui',
        port: 8080,
        host: '0.0.0.0',
        workdir: '/repo',
        password: null,
        showPassword: false,
        defaultBranch: null,
        defaultBranches: null,
        cookieSecure: 'auto',
        codexCommand: null,
        claudeCommand: null,
        cursorCommand: null,
        ideCommand: null,
        vscodeCommand: null,
        ngrokApiKey: 'key',
        ngrokDomain: 'domain',
        automationApiKey: null,
        openaiApiKey: null,
        branchNameLlm: null,
        planLlm: null,
        terminalSessionMode: 'auto',
      });
    } finally {
      __setServerStarterTestOverrides();
      stdoutMock.mock.restore();
      onMock.mock.restore();
    }

    assert.equal(startServerMock.mock.calls.length, 1);
    const startArgs = startServerMock.mock.calls[0]?.arguments[0];
    assert.ok(startArgs);
    assert.equal(startArgs.password, 'generated-pass');
    assert.equal(startArgs.workdir, '/repo');
    assert.deepEqual(startArgs.ngrok, { apiKey: 'key', domain: 'domain' });
    assert.equal(onCalls.length >= 2, true);
    assert.ok(onCalls.some((call) => call.signal === 'SIGINT'));
    assert.ok(onCalls.some((call) => call.signal === 'SIGTERM'));

    const output = stdout.join('');
    assert.ok(output.includes('Serving UI'));
    assert.ok(output.includes('Password: generated-pass'));
    assert.ok(output.includes('Public URL'));
  });

  it('suppresses password logging when operator provides password', async () => {
    const startServerMock = mock.fn(async () => ({
      server: {},
      host: '127.0.0.1',
      port: 3000,
      uiPath: '/tmp/ui',
      close: mock.fn(async () => {}),
      password: 'server-pass',
      publicUrl: null,
    }));

    const stdout: string[] = [];
    const stdoutMock = mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
      stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });

    __setServerStarterTestOverrides({
      startServer: startServerMock,
      generateRandomPassword: () => 'should-not-be-used',
    });

    try {
      await startAppServer({
        uiPath: './ui',
        port: 3000,
        host: '127.0.0.1',
        workdir: '/repo',
        password: 'operator-pass',
        showPassword: false,
        defaultBranch: null,
        defaultBranches: null,
        cookieSecure: 'auto',
        codexCommand: null,
        claudeCommand: null,
        cursorCommand: null,
        ideCommand: null,
        vscodeCommand: null,
        ngrokApiKey: null,
        ngrokDomain: null,
        automationApiKey: null,
        openaiApiKey: null,
        branchNameLlm: null,
        planLlm: null,
        terminalSessionMode: 'auto',
      });
    } finally {
      __setServerStarterTestOverrides();
      stdoutMock.mock.restore();
    }

    const output = stdout.join('');
    assert.ok(output.includes('Password logging suppressed'));
    assert.ok(!output.includes('operator-pass'));
    assert.ok(!output.includes('should-not-be-used'));
  });
});

