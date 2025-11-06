import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_AGENT_COMMANDS, createAgentCommands } from './agent-commands.js';

describe('createAgentCommands', () => {
  it('returns default commands when overrides are absent', () => {
    const commands = createAgentCommands();
    assert.deepEqual(commands, DEFAULT_AGENT_COMMANDS);
  });

  it('applies overrides and derives dangerous variants', () => {
    const commands = createAgentCommands({
      codex: 'codex --interactive',
      claude: 'claude --fast',
      cursor: 'cursor --headless',
      ide: 'cursor --ignored',
      vscode: 'code --folder-uri',
    });

    assert.equal(commands.codex, 'codex --interactive');
    assert.equal(commands.codexDangerous.endsWith('--dangerously-bypass-approvals-and-sandbox'), true);
    assert.equal(commands.codexDangerous.startsWith('codex --interactive'), true);
    assert.equal(commands.claude, 'claude --fast');
    assert.equal(commands.claudeDangerous.includes('--dangerously-skip-permissions'), true);
    assert.equal(commands.cursor, 'cursor --headless');
    assert.equal(commands.vscode, 'code --folder-uri');
  });

  it('respects explicit dangerous overrides when provided', () => {
    const commands = createAgentCommands({
      codexDangerous: 'codex custom-danger',
      claudeDangerous: 'claude custom-danger',
    });

    assert.equal(commands.codexDangerous, 'codex custom-danger');
    assert.equal(commands.claudeDangerous, 'claude custom-danger');
  });
});

