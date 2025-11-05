import os from 'node:os';
import path from 'node:path';

export const CONFIG_DIR_NAME = '.agentrix';
export const CONFIG_FILE_NAME = 'config.json';

export const VALID_BRANCH_LLMS = new Set(['codex', 'claude', 'cursor']);
export const VALID_TERMINAL_SESSION_MODES = new Set(['auto', 'tmux', 'pty']);
export const VALID_COOKIE_SECURE_MODES = new Set(['true', 'false', 'auto']);

export function getConfigFilePath(): string | null {
  const homeDir = os.homedir();
  if (!homeDir) {
    return null;
  }
  return path.join(homeDir, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}


