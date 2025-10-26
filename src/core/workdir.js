import fs from 'node:fs/promises';
import path from 'node:path';

export async function resolveWorkdir(dirPath) {
  const resolved = path.resolve(dirPath);

  try {
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) {
      throw new Error(`Working directory is not a directory: ${resolved}`);
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`Working directory not found at ${resolved}`);
    }
    throw error;
  }

  return resolved;
}
