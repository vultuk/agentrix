import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

async function removeFile(path: string): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch (error: unknown) {
    const err = toError(error) as Error & { code?: string };
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

async function writeAtomicJSON({ filePath, payload }: { filePath: string; payload: string }): Promise<void> {
  const directory = dirname(filePath);
  await ensureDirectory(directory);
  const tmpPath = join(directory, `.${randomUUID()}.tmp`);
  try {
    await writeFile(tmpPath, payload, 'utf8');
    await rename(tmpPath, filePath);
  } catch (error: unknown) {
    await removeFile(tmpPath).catch(() => {});
    throw error;
  }
}

export interface TaskStoreConfig {
  root: string;
  filename?: string;
  logger?: Console;
  now?: () => Date;
}

export interface TaskStore {
  loadSnapshot(): Promise<unknown[]>;
  saveSnapshot(tasks: unknown): Promise<void>;
  readonly filePath: string;
  readonly directory: string;
}

export function createTaskStore({
  root,
  filename = 'tasks.json',
  logger = console,
  now = () => new Date(),
}: TaskStoreConfig): TaskStore {
  if (typeof root !== 'string' || !root.trim()) {
    throw new Error('Task store root directory is required');
  }

  const resolvedRoot = resolve(root);
  const storageDirectory = join(resolvedRoot, '.terminal-worktree');
  const filePath = join(storageDirectory, filename);
  let writeQueue: Promise<void> = Promise.resolve();

  async function loadSnapshot(): Promise<unknown[]> {
    try {
      const raw = await readFile(filePath, 'utf8');
      if (!raw.trim()) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tasks)) {
        return parsed.tasks;
      }
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch (error: unknown) {
      const err = toError(error) as Error & { code?: string };
      if (err.code === 'ENOENT') {
        return [];
      }
      logger?.warn?.(
        '[terminal-worktree] Failed to load persisted tasks snapshot:',
        err.message || err
      );
      return [];
    }
  }

  async function saveSnapshot(tasks: unknown): Promise<void> {
    const snapshot = {
      version: 1,
      generatedAt: now().toISOString(),
      tasks: Array.isArray(tasks) ? tasks : [],
    };
    const payload = `${JSON.stringify(snapshot, null, 2)}\n`;
    const task = writeQueue.then(async () => {
      await writeAtomicJSON({ filePath, payload });
    });
    const placeholder = task.catch(() => {});
    writeQueue = placeholder;
    try {
      await task;
    } catch (error: unknown) {
      logger?.error?.('[terminal-worktree] Failed to persist tasks snapshot:', error);
      throw error;
    } finally {
      if (writeQueue === placeholder) {
        writeQueue = Promise.resolve();
      }
    }
  }

  return {
    loadSnapshot,
    saveSnapshot,
    get filePath() {
      return filePath;
    },
    get directory() {
      return storageDirectory;
    },
  };
}
