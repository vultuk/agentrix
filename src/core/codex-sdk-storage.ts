import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import type { CodexSdkEvent } from '../types/codex-sdk.js';

const HOME_STORAGE_DIR = '.codex';
const NAMESPACE_DIR = 'agentrix';
const WORKTREE_DIR = 'worktrees';
const SESSIONS_DIR = 'sessions';

export interface CodexSdkStoredSession {
  sessionId: string;
  org: string;
  repo: string;
  branch: string;
  label: string;
  createdAt: string;
  lastActivityAt: string | null;
  threadId: string | null;
  events: CodexSdkEvent[];
}

function getSessionDirectory(worktreePath: string): string | null {
  const homeDir = os.homedir?.() || '';
  if (!homeDir) {
    return null;
  }
  return path.join(homeDir, HOME_STORAGE_DIR, NAMESPACE_DIR, WORKTREE_DIR, createWorktreeKey(worktreePath), SESSIONS_DIR);
}

function getSessionPath(worktreePath: string, sessionId: string): string | null {
  const directory = getSessionDirectory(worktreePath);
  if (!directory) {
    return null;
  }
  return path.join(directory, `${sessionId}.json`);
}

export async function listStoredSessions(worktreePath: string): Promise<CodexSdkStoredSession[]> {
  try {
    const directory = getSessionDirectory(worktreePath);
    if (!directory) {
      return [];
    }
    const files = await readdir(directory);
    const results: CodexSdkStoredSession[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }
      const filePath = path.join(directory, file);
      try {
        const raw = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
          continue;
        }
        results.push(normaliseRecord(parsed));
      } catch (error) {
        console.warn('[agentrix] Failed to load Codex SDK transcript:', file, error);
      }
    }
    return results;
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

export async function readStoredSession(worktreePath: string, sessionId: string): Promise<CodexSdkStoredSession | null> {
  const sessionPath = getSessionPath(worktreePath, sessionId);
  if (!sessionPath) {
    return null;
  }
  try {
    const raw = await readFile(sessionPath, 'utf8');
    return normaliseRecord(JSON.parse(raw));
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeStoredSession(worktreePath: string, record: CodexSdkStoredSession): Promise<void> {
  const directory = getSessionDirectory(worktreePath);
  if (!directory) {
    console.warn('[agentrix] Skipping Codex SDK persistence because homedir is unavailable.');
    return;
  }
  await mkdir(directory, { recursive: true });
  const payload = JSON.stringify(record, null, 2);
  const sessionPath = getSessionPath(worktreePath, record.sessionId);
  if (!sessionPath) {
    return;
  }
  await writeFile(sessionPath, payload, 'utf8');
}

export async function deleteStoredSession(worktreePath: string, sessionId: string): Promise<void> {
  const sessionPath = getSessionPath(worktreePath, sessionId);
  if (!sessionPath) {
    return;
  }
  try {
    await rm(sessionPath);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

function normaliseRecord(raw: any): CodexSdkStoredSession {
  return {
    sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : raw.id || '',
    org: typeof raw.org === 'string' ? raw.org : '',
    repo: typeof raw.repo === 'string' ? raw.repo : '',
    branch: typeof raw.branch === 'string' ? raw.branch : '',
    label: typeof raw.label === 'string' && raw.label.trim().length > 0 ? raw.label : 'Codex Session',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    lastActivityAt: typeof raw.lastActivityAt === 'string' ? raw.lastActivityAt : null,
    threadId: typeof raw.threadId === 'string' ? raw.threadId : null,
    events: Array.isArray(raw.events) ? (raw.events as CodexSdkEvent[]) : [],
  };
}

function createWorktreeKey(worktreePath: string): string {
  const baseName = (path.basename(worktreePath) || 'worktree').replace(/[^a-zA-Z0-9._-]+/g, '-');
  const hash = createHash('sha1').update(worktreePath).digest('hex').slice(0, 12);
  return `${baseName || 'worktree'}-${hash}`;
}
