import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  getRepositoryInitCommand,
  loadRepositoryConfig,
  normaliseInitCommand,
  setRepositoryInitCommand,
  updateRepositoryConfig,
} from './repository-config.js';

async function createRepoRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'agentrix-repo-config-'));
}

describe('repository-config', () => {
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = await createRepoRoot();
  });

  afterEach(async () => {
    if (repoRoot) {
      await rm(repoRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('loads default config when file is missing', async () => {
    const config = await loadRepositoryConfig(repoRoot);
    assert.deepEqual(config, { initCommand: '' });
  });

  it('logs warning and returns defaults when JSON is invalid', async () => {
    const warn = mock.method(console, 'warn');
    const configPath = join(repoRoot, '.agentrix.json');
    await writeFile(configPath, '{invalid', 'utf8');

    const config = await loadRepositoryConfig(repoRoot);
    assert.deepEqual(config, { initCommand: '' });
    assert.equal(warn.mock.calls.length, 1);
    assert.match(String(warn.mock.calls[0]?.arguments[0] ?? ''), /Failed to parse repository config/);
    warn.mock.restore();
  });

  it('updates repository config and trims values', async () => {
    const updated = await updateRepositoryConfig(repoRoot, { initCommand: '  npm run setup  ' });
    assert.deepEqual(updated, { initCommand: 'npm run setup' });

    const persisted = JSON.parse(await readFile(join(repoRoot, '.agentrix.json'), 'utf8')) as {
      initCommand: string;
    };
    assert.equal(persisted.initCommand, 'npm run setup');
  });

  it('provides helpers for getting and setting init command', async () => {
    await setRepositoryInitCommand(repoRoot, ' echo hello ');
    const command = await getRepositoryInitCommand(repoRoot);
    assert.equal(command, 'echo hello');

    assert.equal(normaliseInitCommand('  ./script.sh  '), './script.sh');
    assert.equal(normaliseInitCommand(123 as never), '');
  });
});


