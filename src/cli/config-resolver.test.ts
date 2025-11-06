import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it, mock } from 'node:test';

import { parseArgs } from './arg-parser.js';
import { resolveConfig, validateNgrokConfig, buildConfigToSave } from './config-resolver.js';

describe('config-resolver', () => {
  it('prefers CLI provided values over file configuration', () => {
    const args = parseArgs([
      '--port',
      '8081',
      '--ui',
      './ui',
      '--workdir',
      './workspace',
      '--codex-command',
      'codex-custom',
    ]);

    const fileConfig = {
      port: 9999,
      ui: './other-ui',
      workdir: './other-workdir',
      codexCommand: 'codex-file',
    };

    const cwdMock = mock.method(process, 'cwd', () => '/tmp/project');
    try {
      const resolved = resolveConfig(args, fileConfig);
      assert.equal(resolved.port, 8081);
      assert.equal(resolved.uiPath, path.resolve('/tmp/project', './ui'));
      assert.equal(resolved.workdir, path.resolve('/tmp/project', './workspace'));
      assert.equal(resolved.codexCommand, 'codex-custom');
    } finally {
      cwdMock.mock.restore();
    }
  });

  it('falls back to configuration values and defaults', () => {
    const args = parseArgs([]);
    const fileConfig = {
      port: 1234,
      host: '127.0.0.1',
      ui: './dist',
      workdir: './repo',
      defaultBranch: 'develop',
      cursorCommand: 'cursor-cli',
      ideCommand: 'deprecated-ide',
      terminalSessionMode: 'tmux',
    };

    const cwdMock = mock.method(process, 'cwd', () => '/tmp/project');
    try {
      const resolved = resolveConfig(args, fileConfig);
      assert.equal(resolved.port, 1234);
      assert.equal(resolved.host, '127.0.0.1');
      assert.equal(resolved.uiPath, path.resolve('/tmp/project', './dist'));
      assert.equal(resolved.workdir, path.resolve('/tmp/project', './repo'));
      assert.equal(resolved.defaultBranch, 'develop');
      assert.equal(resolved.cursorCommand, 'cursor-cli');
      assert.equal(resolved.ideCommand, 'deprecated-ide');
      assert.equal(resolved.terminalSessionMode, 'tmux');
    } finally {
      cwdMock.mock.restore();
    }
  });

  it('uses IDE command as fallback for cursor command when CLI did not provide one', () => {
    const args = parseArgs([]);
    const fileConfig = {
      ideCommand: 'old-ide',
    };

    const resolved = resolveConfig(args, fileConfig);
    assert.equal(resolved.cursorCommand, 'old-ide');
  });

  it('validates ngrok configuration pairing', () => {
    const config = resolveConfig(parseArgs([]), { ngrokApiKey: 'key' });
    assert.throws(() => validateNgrokConfig(config));

    const okConfig = resolveConfig(parseArgs([]), { ngrokApiKey: 'key', ngrokDomain: 'domain' });
    assert.doesNotThrow(() => validateNgrokConfig(okConfig));
  });

  it('builds configuration save payload based on provided fields', () => {
    const args = parseArgs([
      '--port',
      '3333',
      '--ui',
      './ui',
      '--workdir',
      './workdir',
      '--terminal-session-mode',
      'tmux',
    ]);

    const fileConfig = {
      codexCommand: 'codex-file',
      ngrok: { apiKey: 'file-key', domain: 'file-domain' },
    };

    const cwdMock = mock.method(process, 'cwd', () => '/tmp/project');
    try {
      const resolved = resolveConfig(args, fileConfig);
      const savePayload = buildConfigToSave(resolved, args, fileConfig);

      assert.equal(savePayload.port, 3333);
      assert.equal(savePayload.host, resolved.host);
      assert.equal(savePayload.ui, './ui');
      assert.equal(savePayload.workdir, './workdir');
      assert.equal(savePayload.terminalSessionMode, 'tmux');
      assert.deepEqual(savePayload.commands, { codex: 'codex-file' });
    } finally {
      cwdMock.mock.restore();
    }
  });
});

