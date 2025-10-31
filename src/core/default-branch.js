import { promisify } from 'node:util';
import * as childProcess from 'node:child_process';

const execFileAsync = promisify(childProcess.execFile);

function parseRef(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  const match = trimmed.match(/refs\/heads\/(.+)$/);
  return match ? match[1] : trimmed || null;
}

export async function resolveDefaultBranch(repositoryPath, { remote = 'origin', override } = {}) {
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

export function selectDefaultBranchOverride(config, org, repo) {
  if (!config) {
    return undefined;
  }
  const { overrides, global } = config;
  if (overrides && typeof overrides === 'object') {
    const key = `${org}/${repo}`;
    const value = overrides[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  if (typeof global === 'string' && global.trim()) {
    return global.trim();
  }
  return undefined;
}
