import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Resolves and validates the work directory path
 * @param workdir - Work directory path
 * @returns Absolute path to work directory
 * @throws {Error} If directory doesn't exist or isn't accessible
 */
export async function resolveWorkdir(workdir: string): Promise<string> {
  const absolute = path.resolve(workdir);

  try {
    const stats = await fs.stat(absolute);
    if (!stats.isDirectory()) {
      throw new Error(`Workdir path is not a directory: ${absolute}`);
    }
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };
    if (err.code === 'ENOENT') {
      throw new Error(`Workdir does not exist: ${absolute}`);
    }
    throw new Error(`Unable to access workdir ${absolute}: ${err.message}`);
  }

  return absolute;
}
