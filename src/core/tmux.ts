/* c8 ignore file */
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';

import { TMUX_BIN, TMUX_SESSION_PREFIX } from '../config/constants.js';

const execFileAsync = promisify(execFile);

let tmuxAvailable = false;
let tmuxVersion: string | null = null;
let tmuxDetection: Promise<{ available: boolean; version: string | null }> | undefined;

export interface TmuxDetectionResult {
  available: boolean;
  version: string | null;
}

export interface TmuxSessionInfo {
  org: string;
  repo: string;
  branch: string;
}

export interface TmuxRunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
}

export async function detectTmux(): Promise<TmuxDetectionResult> {
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

export function isTmuxAvailable(): boolean {
  return tmuxAvailable;
}

export async function runTmux(args: string[], options: TmuxRunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(TMUX_BIN, args, { maxBuffer: 1024 * 1024, ...options });
}

export function sanitiseTmuxComponent(value: unknown, fallback: string): string {
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

export function makeTmuxSessionName(org: string, repo: string, branch: string): string {
  const orgPart = sanitiseTmuxComponent(org, 'org');
  const repoPart = sanitiseTmuxComponent(repo, 'repo');
  const branchPart = sanitiseTmuxComponent(branch, 'branch');
  return `${TMUX_SESSION_PREFIX}${orgPart}--${repoPart}--${branchPart}`;
}

export function parseTmuxSessionName(sessionName: string): TmuxSessionInfo | null {
  if (typeof sessionName !== 'string' || !sessionName.startsWith(TMUX_SESSION_PREFIX)) {
    return null;
  }
  const remainder = sessionName.slice(TMUX_SESSION_PREFIX.length);
  const parts = remainder.split('--');
  if (parts.length < 3) {
    return null;
  }
  const [org, repo, branch] = parts;
  if (!org || !repo || !branch) {
    return null;
  }
  return { org, repo, branch };
}

export function makeSanitisedSessionKey(org: string, repo: string, branch: string): string {
  const orgPart = sanitiseTmuxComponent(org, 'org');
  const repoPart = sanitiseTmuxComponent(repo, 'repo');
  const branchPart = sanitiseTmuxComponent(branch, 'branch');
  return `${orgPart}--${repoPart}--${branchPart}`;
}

export function buildSanitisedWorktreeLookup(structure: unknown): Map<string, TmuxSessionInfo> {
  const map = new Map<string, TmuxSessionInfo>();
  const struct = structure as Record<string, Record<string, { branches?: string[] } | unknown>>;
  Object.entries(struct || {}).forEach(([org, repos]) => {
    const repoEntries = repos && typeof repos === 'object' ? repos : {};
    Object.entries(repoEntries).forEach(([repo, info]) => {
      const infoObj = info as { branches?: string[] };
      const branchList = Array.isArray(infoObj?.branches)
        ? infoObj.branches
        : Array.isArray(info)
          ? (info as string[])
          : [];
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

function tmuxTarget(sessionName: string): string {
  return `=${sessionName}`;
}

export async function tmuxHasSession(sessionName: string): Promise<boolean> {
  try {
    await runTmux(['has-session', '-t', tmuxTarget(sessionName)]);
    return true;
  } catch (error: unknown) {
    const err = error as { code?: number };
    if (typeof err.code === 'number') {
      return false;
    }
    throw error;
  }
}

export async function tmuxKillSession(sessionName: string): Promise<void> {
  try {
    await runTmux(['kill-session', '-t', tmuxTarget(sessionName)]);
  } catch (error: unknown) {
    const err = error as { code?: number };
    if (typeof err.code === 'number') {
      return;
    }
    throw error;
  }
}

export async function tmuxKillSessionsForRepository(
  org: string,
  repo: string,
  branches: string[]
): Promise<void> {
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
      } catch (error: unknown) {
        const err = error as { message?: string };
        console.warn(
          `[agentrix] Failed to kill tmux session ${tmuxSessionName}:`,
          err?.message || error
        );
      }
    });
  if (tasks.length === 0) {
    return;
  }
  await Promise.allSettled(tasks);
}
