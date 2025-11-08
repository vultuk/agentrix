import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WorktreeSessionSummary, TerminalSessionSnapshot } from '../types/terminal.js';

const CONFIG_DIR_NAME = '.agentrix';
const SNAPSHOT_FILE_NAME = 'sessions.json';

interface SessionPersistenceDependencies {
  homedir: () => string;
  mkdir: typeof mkdir;
  writeFile: typeof writeFile;
  readFile: typeof readFile;
  rename: typeof rename;
  rm: typeof rm;
  randomUUID: typeof randomUUID;
  now: () => Date;
}

const defaultDependencies: SessionPersistenceDependencies = {
  homedir: os.homedir,
  mkdir,
  writeFile,
  readFile,
  rename,
  rm,
  randomUUID,
  now: () => new Date(),
};

let overrides: Partial<SessionPersistenceDependencies> | null = null;

function getDependency<K extends keyof SessionPersistenceDependencies>(key: K): SessionPersistenceDependencies[K] {
  return (overrides?.[key] ?? defaultDependencies[key]) as SessionPersistenceDependencies[K];
}

export function __setSessionPersistenceTestOverrides(
  nextOverrides?: Partial<SessionPersistenceDependencies>,
): void {
  overrides = nextOverrides ?? null;
}

let writeQueue: Promise<void> = Promise.resolve();
let lastPersistedPayload: string | null = null;

export function __resetSessionPersistenceStateForTests(): void {
  writeQueue = Promise.resolve();
  lastPersistedPayload = null;
}

function getSnapshotFilePath(): string | null {
  const homeDir = getDependency('homedir')();
  if (!homeDir) {
    return null;
  }
  return path.join(homeDir, CONFIG_DIR_NAME, SNAPSHOT_FILE_NAME);
}

function sanitiseSession(session: TerminalSessionSnapshot | null | undefined): TerminalSessionSnapshot | null {
  if (!session || typeof session !== 'object') {
    return null;
  }
  const id = typeof session.id === 'string' ? session.id : null;
  if (!id) {
    return null;
  }
  const label = typeof session.label === 'string' && session.label.trim().length > 0 ? session.label : 'Terminal';
  const kind = session.kind === 'automation' ? 'automation' : 'interactive';
  const tool = session.tool === 'agent' ? 'agent' : 'terminal';
  return {
    id,
    label,
    kind,
    tool,
    idle: Boolean(session.idle),
    usingTmux: Boolean(session.usingTmux),
    lastActivityAt: typeof session.lastActivityAt === 'string' ? session.lastActivityAt : null,
    createdAt: typeof session.createdAt === 'string' ? session.createdAt : null,
    tmuxSessionName:
      typeof (session as { tmuxSessionName?: unknown }).tmuxSessionName === 'string'
        ? (session as { tmuxSessionName?: string }).tmuxSessionName
        : null,
  };
}

function sanitiseSummaries(summaries: WorktreeSessionSummary[]): WorktreeSessionSummary[] {
  if (!Array.isArray(summaries)) {
    return [];
  }
  return summaries
    .filter(
      (entry): entry is WorktreeSessionSummary =>
        Boolean(entry && entry.org && entry.repo && entry.branch),
    )
    .map((entry) => ({
      org: entry.org,
      repo: entry.repo,
      branch: entry.branch,
      idle: Boolean(entry.idle),
      lastActivityAt: typeof entry.lastActivityAt === 'string' ? entry.lastActivityAt : null,
      sessions: Array.isArray(entry.sessions)
        ? entry.sessions
            .map(sanitiseSession)
            .filter((session): session is TerminalSessionSnapshot => Boolean(session))
        : [],
    }));
}

interface PersistedWorktree {
  branch: string;
  idle: boolean;
  lastActivityAt: string | null;
  sessions: TerminalSessionSnapshot[];
}

type PersistedTree = Record<string, Record<string, { worktrees: Record<string, PersistedWorktree> }>>;

function buildOrgTree(summaries: WorktreeSessionSummary[]): PersistedTree {
  const tree: PersistedTree = {};
  summaries.forEach((summary) => {
    const orgEntry = (tree[summary.org] ??= {});
    const repoEntry = (orgEntry[summary.repo] ??= { worktrees: {} });
    repoEntry.worktrees[summary.branch] = {
      branch: summary.branch,
      idle: Boolean(summary.idle),
      lastActivityAt: summary.lastActivityAt ?? null,
      sessions: Array.isArray(summary.sessions) ? summary.sessions.slice() : [],
    };
  });
  return tree;
}

async function writeAtomicJSON(filePath: string, payload: string): Promise<void> {
  const directory = path.dirname(filePath);
  await getDependency('mkdir')(directory, { recursive: true });
  const tmpPath = path.join(directory, `.${getDependency('randomUUID')()}.tmp`);
  try {
    await getDependency('writeFile')(tmpPath, payload, 'utf8');
    await getDependency('rename')(tmpPath, filePath);
  } catch (error) {
    await getDependency('rm')(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function persistSessionsSnapshot(summaries: WorktreeSessionSummary[] = []): Promise<void> {
  const filePath = getSnapshotFilePath();
  if (!filePath) {
    return;
  }
  const normalised = sanitiseSummaries(summaries);
  const snapshot = {
    version: 1,
    generatedAt: getDependency('now')().toISOString(),
    orgs: buildOrgTree(normalised),
    summaries: normalised,
  };
  const payload = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (payload === lastPersistedPayload) {
    return;
  }
  const task = writeQueue.then(async () => {
    await writeAtomicJSON(filePath, payload);
  });
  const placeholder = task.catch(() => {});
  writeQueue = placeholder;
  try {
    await task;
    lastPersistedPayload = payload;
  } finally {
    if (writeQueue === placeholder) {
      writeQueue = Promise.resolve();
    }
  }
}

export async function loadPersistedSessionsSnapshot(): Promise<WorktreeSessionSummary[]> {
  const filePath = getSnapshotFilePath();
  if (!filePath) {
    return [];
  }
  try {
    const raw = await getDependency('readFile')(filePath, 'utf8');
    if (!raw.trim()) {
      return [];
    }
    const payload = JSON.parse(raw);
    if (payload && Array.isArray(payload.summaries)) {
      return sanitiseSummaries(payload.summaries);
    }
    if (Array.isArray(payload)) {
      return sanitiseSummaries(payload);
    }
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err?.code !== 'ENOENT') {
      console.warn(`[agentrix] Failed to read persisted sessions snapshot at ${filePath}:`, err?.message || error);
    }
    return [];
  }
  return [];
}
