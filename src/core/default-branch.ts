import { promisify } from 'node:util';
import * as childProcess from 'node:child_process';

const execFileAsync = promisify(childProcess.execFile);

export interface DefaultBranchOptions {
  remote?: string;
  override?: string;
}

export interface DefaultBranchConfig {
  global?: string;
  overrides?: Record<string, string>;
  repositories?: Record<string, string>;
}

function parseRef(value: string | null): string | null {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  const match = trimmed.match(/refs\/heads\/(.+)$/);
  return match ? match[1]! : trimmed || null;
}

export async function resolveDefaultBranch(
  repositoryPath: string,
  { remote = 'origin', override }: DefaultBranchOptions = {}
): Promise<string> {
  if (override && typeof override === 'string' && override.trim()) {
    return override.trim();
  }

  try {
    const { stdout } = await execFileAsync('git', ['-C', repositoryPath, 'symbolic-ref', 'HEAD'], {
      maxBuffer: 1024 * 1024,
    });
    const headBranch = parseRef(stdout);
    if (headBranch) {
      return headBranch;
    }
  } catch {
    // fall through to remote inspection
  }

  try {
    const { stdout } = await execFileAsync('git', ['remote', 'show', remote], {
      cwd: repositoryPath,
      maxBuffer: 1024 * 1024,
    });
    const lines = stdout.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.toLowerCase().startsWith('head branch:')) {
        continue;
      }
      const branch = trimmed.slice('head branch:'.length).trim();
      if (branch && branch.toLowerCase() !== '(unknown)') {
        return branch;
      }
    }
  } catch {
    // fall through
  }

  return 'main';
}

export function selectDefaultBranchOverride(
  config: DefaultBranchConfig | unknown,
  org: string,
  repo: string
): string | undefined {
  if (!config) {
    return undefined;
  }
  const cfg = config as DefaultBranchConfig;
  const { overrides, repositories, global } = cfg;
  
  // Try repository-specific override first
  if (repositories && typeof repositories === 'object') {
    const key = `${org}/${repo}`;
    const value = repositories[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  
  // Try legacy overrides format
  if (overrides && typeof overrides === 'object') {
    const key = `${org}/${repo}`;
    const value = overrides[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  
  // Fall back to global default
  if (typeof global === 'string' && global.trim()) {
    return global.trim();
  }
  
  return undefined;
}
