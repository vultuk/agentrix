import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveWorkdir } from './workdir.js';

describe('resolveWorkdir', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'agentrix-workdir-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('resolves existing directories to absolute paths', async () => {
    const resolved = await resolveWorkdir(tempDir);
    assert.equal(resolved, tempDir);
  });

  it('throws when directory does not exist', async () => {
    await rm(tempDir, { recursive: true, force: true });
    await assert.rejects(() => resolveWorkdir(tempDir), /Workdir does not exist/);
  });

  it('throws when path points to a file', async () => {
    const filePath = join(tempDir, 'file.txt');
    await writeFile(filePath, 'content', 'utf8');
    await assert.rejects(() => resolveWorkdir(filePath), /Workdir path is not a directory/);
  });
});


