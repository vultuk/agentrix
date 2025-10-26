import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

import { TMUX_BIN, TMUX_SESSION_PREFIX } from '../config/constants.js';

const execFileAsync = promisify(execFile);

let tmuxAvailable = false;
let tmuxVersion = null;
let tmuxDetection;

export async function detectTmux() {
  if (!tmuxDetection) {
    tmuxDetection = (async () => {
      try {
        const { stdout } = await execFileAsync(TMUX_BIN, ['-V'], { maxBuffer: 1024 * 1024 });
        tmuxAvailable = true;
        tmuxVersion = stdout ? stdout.trim() : null;
      } catch {
        tmuxAvailable = false;
        tmuxVersion = null;
      }
      return { available: tmuxAvailable, version: tmuxVersion };
    })();
  }
  return tmuxDetection;
}

export function isTmuxAvailable() {
  return tmuxAvailable;
}

export async function runTmux(args, options = {}) {
  return execFileAsync(TMUX_BIN, args, { maxBuffer: 1024 * 1024, ...options });
}

export function sanitiseTmuxComponent(value, fallback) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const cleaned = trimmed
    .replace(/\s+/g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned || fallback;
}

export function makeTmuxSessionName(org, repo, branch) {
  const orgPart = sanitiseTmuxComponent(org, 'org');
  const repoPart = sanitiseTmuxComponent(repo, 'repo');
  const branchPart = sanitiseTmuxComponent(branch, 'branch');
  return `${TMUX_SESSION_PREFIX}${orgPart}--${repoPart}--${branchPart}`;
}

export function parseTmuxSessionName(sessionName) {
  if (typeof sessionName !== 'string' || !sessionName.startsWith(TMUX_SESSION_PREFIX)) {
    return null;
  }
  const remainder = sessionName.slice(TMUX_SESSION_PREFIX.length);
  const parts = remainder.split('--');
  if (parts.length !== 3) {
    return null;
  }
  const [org, repo, branch] = parts;
  if (!org || !repo || !branch) {
    return null;
  }
  return { org, repo, branch };
}

export function makeSanitisedSessionKey(org, repo, branch) {
  const orgPart = sanitiseTmuxComponent(org, 'org');
  const repoPart = sanitiseTmuxComponent(repo, 'repo');
  const branchPart = sanitiseTmuxComponent(branch, 'branch');
  return `${orgPart}--${repoPart}--${branchPart}`;
}

export function buildSanitisedWorktreeLookup(structure) {
  const map = new Map();
  Object.entries(structure || {}).forEach(([org, repos]) => {
    const repoEntries = repos && typeof repos === 'object' ? repos : {};
    Object.entries(repoEntries).forEach(([repo, branches]) => {
      const branchList = Array.isArray(branches) ? branches : [];
      branchList.forEach((branch) => {
        if (!branch) {
          return;
        }
        const key = makeSanitisedSessionKey(org, repo, branch);
        if (!map.has(key)) {
          map.set(key, { org, repo, branch });
        }
      });
    });
  });
  return map;
}

function tmuxTarget(sessionName) {
  return `=${sessionName}`;
}

export async function tmuxHasSession(sessionName) {
  try {
    await runTmux(['has-session', '-t', tmuxTarget(sessionName)]);
    return true;
  } catch (error) {
    if (typeof error.code === 'number') {
      return false;
    }
    throw error;
  }
}

export async function tmuxKillSession(sessionName) {
  try {
    await runTmux(['kill-session', '-t', tmuxTarget(sessionName)]);
  } catch (error) {
    if (typeof error.code === 'number') {
      return;
    }
    throw error;
  }
}

export async function tmuxKillSessionsForRepository(org, repo, branches) {
  if (!org || !repo || !Array.isArray(branches) || branches.length === 0) {
    return;
  }
  await detectTmux();
  if (!isTmuxAvailable()) {
    return;
  }
  const tasks = branches
    .filter((branch) => typeof branch === 'string' && branch.length > 0)
    .map(async (branch) => {
      const tmuxSessionName = makeTmuxSessionName(org, repo, branch);
      try {
        await tmuxKillSession(tmuxSessionName);
      } catch (error) {
        console.warn(
          `[terminal-worktree] Failed to kill tmux session ${tmuxSessionName}:`,
          error?.message || error,
        );
      }
    });
  if (tasks.length === 0) {
    return;
  }
  await Promise.allSettled(tasks);
}
