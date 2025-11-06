import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

describe('cli config utilities', () => {
  it('normalizes raw configuration values', async () => {
    const { normalizeConfig } = await import('./config.js?test=normalize');

    const raw = {
      port: '8084',
      host: ' 127.0.0.1 ',
      ui: './ui',
      workdir: './repo',
      defaultBranch: ' develop ',
      defaultBranches: { ' org/repo ': ' main ' },
      cookies: { secure: 'false' },
      commands: { codex: 'codex', ide: 'cursor' },
      branchNameLlm: 'Codex',
      plan: { llm: 'claude' },
      ngrok: { apiKey: 'key', domain: 'domain' },
      automation: { apiKey: 'auto' },
      openai: { apiKey: 'openai' },
      terminalSessionMode: 'tmux',
    };

    const normalized = normalizeConfig(raw, 'config.json');
    assert.equal(normalized.port, 8084);
    assert.equal(normalized.host, '127.0.0.1');
    assert.equal(normalized.ui, './ui');
    assert.equal(normalized.workdir, './repo');
    assert.equal(normalized.defaultBranch, 'develop');
    assert.deepEqual(normalized.defaultBranches, { 'org/repo': 'main' });
    assert.equal(normalized.cookieSecure, 'false');
    assert.equal(normalized.codexCommand, 'codex');
    assert.equal(normalized.cursorCommand, undefined);
    assert.equal(normalized.branchNameLlm, 'codex');
    assert.equal(normalized.planLlm, 'claude');
    assert.equal(normalized.ngrokApiKey, 'key');
    assert.equal(normalized.ngrokDomain, 'domain');
    assert.equal(normalized.automationApiKey, 'auto');
    assert.equal(normalized.openaiApiKey, 'openai');
    assert.equal(normalized.terminalSessionMode, 'tmux');
  });

  it('loads configuration from disk and normalizes it', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentrix-config-'));
    const configDir = path.join(tempDir, '.agentrix');
    const configPath = path.join(configDir, 'config.json');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configPath, '{"port": 5020, "host": "0.0.0.0"}\n', 'utf8');

    const homedirMock = mock.method(os, 'homedir', () => tempDir);

    try {
      const { loadConfig } = await import('./config.js?test=load');
      const result = await loadConfig();
      assert.equal(result.path, configPath);
      assert.equal(result.values.port, 5020);
      assert.equal(result.values.host, '0.0.0.0');
    } finally {
      homedirMock.mock.restore();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('handles missing config files gracefully', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentrix-config-'));
    const configPath = path.join(tempDir, '.agentrix', 'config.json');
    const homedirMock = mock.method(os, 'homedir', () => tempDir);

    try {
      const { loadConfig } = await import('./config.js?test=missing');
      const result = await loadConfig();
      assert.equal(result.path, configPath);
      assert.deepEqual(result.values, {});
    } finally {
      homedirMock.mock.restore();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('saves configuration to disk', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentrix-config-'));
    const configDir = path.join(tempDir, '.agentrix');
    const configPath = path.join(configDir, 'config.json');

    const homedirMock = mock.method(os, 'homedir', () => tempDir);

    try {
      const { saveConfig } = await import('./config.js?test=save');
      const savedPath = await saveConfig({ port: 9999 });
      assert.equal(savedPath, configPath);
      const contents = await fs.readFile(configPath, 'utf8');
      assert.equal(JSON.parse(contents).port, 9999);
    } finally {
      homedirMock.mock.restore();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});

