import fs from 'node:fs/promises';
import path from 'node:path';

const CONFIG_FILENAME = '.terminal-worktree.json';
const DEFAULT_CONFIG = Object.freeze({
  initCommand: '',
});

function getConfigPath(repoRoot) {
  if (!repoRoot) {
    throw new Error('repoRoot is required to resolve repository config path');
  }
  return path.join(repoRoot, CONFIG_FILENAME);
}

function sanitiseConfig(input) {
  const initCommand = typeof input?.initCommand === 'string' ? input.initCommand.trim() : '';
  return {
    initCommand,
  };
}

export async function loadRepositoryConfig(repoRoot) {
  if (!repoRoot) {
    throw new Error('repoRoot is required to load repository config');
  }

  const configPath = getConfigPath(repoRoot);

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    try {
      const parsed = JSON.parse(raw);
      return sanitiseConfig(parsed);
    } catch (error) {
      console.warn(
        `[terminal-worktree] Failed to parse repository config at ${configPath}:`,
        error?.message || error,
      );
      return { ...DEFAULT_CONFIG };
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { ...DEFAULT_CONFIG };
    }
    throw error;
  }
}

export async function updateRepositoryConfig(repoRoot, updates) {
  if (!repoRoot) {
    throw new Error('repoRoot is required to update repository config');
  }

  const configPath = getConfigPath(repoRoot);
  const base = await loadRepositoryConfig(repoRoot);
  const next = sanitiseConfig({ ...base, ...updates });
  await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export async function getRepositoryInitCommand(repoRoot) {
  const config = await loadRepositoryConfig(repoRoot);
  return config.initCommand || '';
}

export async function setRepositoryInitCommand(repoRoot, initCommand) {
  return updateRepositoryConfig(repoRoot, { initCommand });
}

export function normaliseInitCommand(value) {
  return typeof value === 'string' ? value.trim() : '';
}

