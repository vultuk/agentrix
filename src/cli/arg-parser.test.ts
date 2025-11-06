import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { parseArgs } from './arg-parser.js';
import { DEFAULT_HOST, DEFAULT_PORT } from '../server/index.js';

describe('parseArgs', () => {
  it('returns defaults when no arguments are provided', () => {
    const parsed = parseArgs([]);

    assert.equal(parsed.port, DEFAULT_PORT);
    assert.equal(parsed.host, DEFAULT_HOST);
    assert.equal(parsed.ui, null);
    assert.equal(parsed.workdir, null);
    assert.equal(parsed.cookieSecure, null);
    assert.equal(parsed.terminalSessionMode, null);
    assert.equal(parsed.showPassword, false);
    assert.deepEqual(parsed._provided, {
      port: false,
      host: false,
      ui: false,
      workdir: false,
      password: false,
      cookieSecure: false,
      defaultBranch: false,
      showPassword: false,
      codexCommand: false,
      claudeCommand: false,
      cursorCommand: false,
      ideCommand: false,
      vscodeCommand: false,
      ngrokApiKey: false,
      ngrokDomain: false,
      openaiApiKey: false,
      terminalSessionMode: false,
      save: false,
    });
  });

  it('parses primary CLI flags and marks provided fields', () => {
    const parsed = parseArgs([
      '--port',
      '8080',
      '--host',
      '0.0.0.0',
      '--ui',
      './dist',
      '--workdir',
      './repo',
      '--password',
      'secret',
      '--cookie-secure',
      'true',
      '--terminal-session-mode',
      'tmux',
      '--show-password',
    ]);

    assert.equal(parsed.port, 8080);
    assert.equal(parsed.host, '0.0.0.0');
    assert.equal(parsed.ui, './dist');
    assert.equal(parsed.workdir, './repo');
    assert.equal(parsed.password, 'secret');
    assert.equal(parsed.cookieSecure, 'true');
    assert.equal(parsed.terminalSessionMode, 'tmux');
    assert.equal(parsed.showPassword, true);
    assert.equal(parsed._provided.port, true);
    assert.equal(parsed._provided.host, true);
    assert.equal(parsed._provided.ui, true);
    assert.equal(parsed._provided.workdir, true);
    assert.equal(parsed._provided.password, true);
    assert.equal(parsed._provided.cookieSecure, true);
    assert.equal(parsed._provided.terminalSessionMode, true);
    assert.equal(parsed._provided.showPassword, true);
  });

  it('supports force-tmux and no-tmux shortcuts', () => {
    const tmuxArgs = parseArgs(['--force-tmux']);
    assert.equal(tmuxArgs.terminalSessionMode, 'tmux');

    const ptyArgs = parseArgs(['--no-tmux']);
    assert.equal(ptyArgs.terminalSessionMode, 'pty');
  });

  it('throws when conflicting terminal session modes are provided', () => {
    assert.throws(() => parseArgs(['--terminal-session-mode', 'tmux', '--no-tmux']));
  });

  it('rejects invalid port values', () => {
    assert.throws(() => parseArgs(['--port', 'not-a-number']));
    assert.throws(() => parseArgs(['--port', '-1']));
    assert.throws(() => parseArgs(['--port', '70000']));
  });

  it('rejects invalid cookie secure values', () => {
    assert.throws(() => parseArgs(['--cookie-secure', 'maybe']));
  });

  it('normalises terminal session mode case', () => {
    const parsed = parseArgs(['--terminal-session-mode', 'PTY']);
    assert.equal(parsed.terminalSessionMode, 'pty');
  });

  it('throws on unknown flags and unexpected positional arguments', () => {
    assert.throws(() => parseArgs(['--no-such-flag']));
    assert.throws(() => parseArgs(['positional']));
  });
});

