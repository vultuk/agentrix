import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const CONFIG_DIR_NAME = '.agentrix';
const CACHE = new Map<string, string>();

function getDeveloperMessagePath(slug: string): string | null {
  if (!slug) {
    return null;
  }
  const homeDir = os.homedir();
  if (!homeDir) {
    return null;
  }
  return path.join(homeDir, CONFIG_DIR_NAME, `${slug}.md`);
}

export async function loadDeveloperMessage(slug: string, fallback: string = ''): Promise<string> {
  if (CACHE.has(slug)) {
    return CACHE.get(slug)!;
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
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err && err.code !== 'ENOENT') {
      console.warn(
        `[agentrix] Failed to read developer message override at ${filePath}:`,
        err?.message || error
      );
    }
  }

  CACHE.set(slug, message);
  return message;
}
