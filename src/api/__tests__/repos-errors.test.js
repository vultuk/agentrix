import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createRepoHandlers } from '../repos.js';

function createContext(method = 'GET') {
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    ended: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(payload = '') {
      this.body = payload;
      this.ended = true;
    },
  };

  return {
    method,
    res,
  };
}

test('list handler surfaces git errors when worktree discovery fails', async () => {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'tw-repos-error-'));
  const repositoryPath = path.join(workdir, 'acme', 'demo', 'repository');
  await fs.mkdir(repositoryPath, { recursive: true });

  try {
    const handlers = createRepoHandlers(workdir);
    const context = createContext('GET');
    await handlers.list(context);

    assert.equal(context.res.statusCode, 500);
    const payload = JSON.parse(context.res.body);
    assert.ok(payload.error.includes(repositoryPath));
    assert.ok(payload.error.toLowerCase().includes('failed to list worktrees'));
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
});
