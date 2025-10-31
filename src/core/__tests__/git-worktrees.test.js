import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { listWorktrees, GitWorktreeError } from '../git.js';

test('listWorktrees throws GitWorktreeError and logs when git fails', async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-worktrees-error-'));
  const restore = mock.method(console, 'error', () => {});

  try {
    await assert.rejects(
      listWorktrees(tempDir),
      (error) => {
        assert.equal(error instanceof GitWorktreeError, true);
        assert.equal(error.message.includes(tempDir), true);
        return true;
      },
    );

    assert.equal(restore.mock.callCount() >= 1, true, 'expected console.error to be called');
  } finally {
    restore.mock.restore();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
