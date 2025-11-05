import fs from 'node:fs/promises';
import path from 'node:path';

const CONFIG_FILENAME = '.terminal-worktree.json';

export interface RepositoryConfig {
  initCommand: string;
}

const DEFAULT_CONFIG: RepositoryConfig = Object.freeze({
  initCommand: '',
});

function getConfigPath(repoRoot: string): string {
  if (!repoRoot) {
    throw new Error('repoRoot is required to resolve repository config path');
  }
  return path.join(repoRoot, CONFIG_FILENAME);
}

function sanitiseConfig(input: unknown): RepositoryConfig {
  const inp = input as { initCommand?: string };
  const initCommand = typeof inp?.initCommand === 'string' ? inp.initCommand.trim() : '';
  return {
    initCommand,
  };
}

export async function loadRepositoryConfig(repoRoot: string): Promise<RepositoryConfig> {
  if (!repoRoot) {
    throw new Error('repoRoot is required to load repository config');
  }

  const configPath = getConfigPath(repoRoot);

  try {
    const raw = await fs.readFile(configPath, 'utf8');
    try {
      const parsed = JSON.parse(raw);
      return sanitiseConfig(parsed);
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.warn(
        `[terminal-worktree] Failed to parse repository config at ${configPath}:`,
        err?.message || error
      );
      return { ...DEFAULT_CONFIG };
    }
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err && err.code === 'ENOENT') {
      return { ...DEFAULT_CONFIG };
    }
    throw error;
  }
}

export async function updateRepositoryConfig(
  repoRoot: string,
  updates: Partial<RepositoryConfig>
): Promise<RepositoryConfig> {
  if (!repoRoot) {
    throw new Error('repoRoot is required to update repository config');
  }

  const configPath = getConfigPath(repoRoot);
  const base = await loadRepositoryConfig(repoRoot);
  const next = sanitiseConfig({ ...base, ...updates });
  await fs.writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return next;
}

export async function getRepositoryInitCommand(repoRoot: string): Promise<string> {
  const config = await loadRepositoryConfig(repoRoot);
  return config.initCommand || '';
}

export async function setRepositoryInitCommand(repoRoot: string, initCommand: string): Promise<RepositoryConfig> {
  return updateRepositoryConfig(repoRoot, { initCommand });
}

export function normaliseInitCommand(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
