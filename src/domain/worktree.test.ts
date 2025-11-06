import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Worktree, createWorktree } from './worktree.js';

const baseData = {
  path: '/repos/vultuk/agentrix/feature-branch',
  branch: 'feature/add-tests',
  org: 'vultuk',
  repo: 'agentrix',
};

describe('Worktree', () => {
  it('provides key helpers for repository identification', () => {
    const worktree = new Worktree(baseData);

    assert.equal(worktree.getKey(), 'vultuk::agentrix::feature/add-tests');
    assert.equal(worktree.getRepositoryId(), 'vultuk/agentrix');
    assert.equal(worktree.toJSON().branch, 'feature/add-tests');
  });

  it('detects the main worktree regardless of case', () => {
    const main = new Worktree({ ...baseData, branch: 'main' });
    const uppercase = new Worktree({ ...baseData, branch: 'MAIN' });
    const custom = new Worktree({ ...baseData, branch: 'Production' });

    assert.equal(main.isMainWorktree(), true);
    assert.equal(uppercase.isMainWorktree(), true);
    assert.equal(custom.isMainWorktree('production'), true);
    assert.equal(custom.isMainWorktree(), false);
  });
});

describe('createWorktree', () => {
  it('creates a Worktree instance', () => {
    const worktree = createWorktree(baseData);

    assert.ok(worktree instanceof Worktree);
    assert.equal(worktree.branch, baseData.branch);
  });
});

