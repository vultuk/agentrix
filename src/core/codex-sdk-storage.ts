import { mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { CodexSdkEvent } from '../types/codex-sdk.js';

const STORAGE_DIR = '.codex-sdk';
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

function getSessionDirectory(worktreePath: string): string {
  return path.join(worktreePath, STORAGE_DIR, SESSIONS_DIR);
}

function getSessionPath(worktreePath: string, sessionId: string): string {
  return path.join(getSessionDirectory(worktreePath), `${sessionId}.json`);
}

export async function listStoredSessions(worktreePath: string): Promise<CodexSdkStoredSession[]> {
  try {
    const directory = getSessionDirectory(worktreePath);
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
  try {
    const raw = await readFile(getSessionPath(worktreePath, sessionId), 'utf8');
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
  await mkdir(directory, { recursive: true });
  const payload = JSON.stringify(record, null, 2);
  await writeFile(getSessionPath(worktreePath, record.sessionId), payload, 'utf8');
}

export async function deleteStoredSession(worktreePath: string, sessionId: string): Promise<void> {
  try {
    await rm(getSessionPath(worktreePath, sessionId));
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
