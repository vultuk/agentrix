import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CONFIG_DIR_NAME = '.terminal-worktree';
const CACHE = new Map();

function getDeveloperMessagePath(slug) {
  if (!slug) {
    return null;
  }
  const homeDir = os.homedir();
  if (!homeDir) {
    return null;
  }
  return path.join(homeDir, CONFIG_DIR_NAME, `${slug}.md`);
}

export async function loadDeveloperMessage(slug, fallback = '') {
  if (CACHE.has(slug)) {
    return CACHE.get(slug);
  }

  const defaultMessage = typeof fallback === 'string' ? fallback : '';
  const filePath = getDeveloperMessagePath(slug);
  if (!filePath) {
    CACHE.set(slug, defaultMessage);
    return defaultMessage;
  }

  let message = defaultMessage;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const trimmed = raw.trim();
    if (trimmed) {
      message = trimmed;
    }
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.warn(
        `[terminal-worktree] Failed to read developer message override at ${filePath}:`,
        error?.message || error,
      );
    }
  }

  CACHE.set(slug, message);
  return message;
}
