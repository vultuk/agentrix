import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Repository, createRepository } from './repository.js';

describe('Repository', () => {
  it('constructs repository with defaults and exposes helpers', () => {
    const repo = new Repository({ org: 'vultuk', repo: 'agentrix' });

    assert.equal(repo.org, 'vultuk');
    assert.equal(repo.repo, 'agentrix');
    assert.deepEqual(repo.branches, []);
    assert.equal(repo.initCommand, '');
    assert.equal(repo.getId(), 'vultuk/agentrix');
    assert.equal(repo.getPath('/workdir'), '/workdir/vultuk/agentrix');
    assert.equal(repo.getRepositoryPath('/workdir'), '/workdir/vultuk/agentrix/repository');
    assert.equal(repo.hasBranches(), false);
    assert.equal(repo.hasBranch('main'), false);

    const json = repo.toJSON();
    assert.deepEqual(json, {
      org: 'vultuk',
      repo: 'agentrix',
      branches: [],
      initCommand: '',
    });
  });

  it('supports repositories with branches and initial command', () => {
    const repo = createRepository({
      org: 'vultuk',
      repo: 'agentrix',
      branches: ['main', 'feature'],
      initCommand: 'npm install',
    });

    assert.equal(repo.hasBranches(), true);
    assert.equal(repo.hasBranch('feature'), true);
    assert.equal(repo.hasBranch('unknown'), false);
    assert.equal(repo.initCommand, 'npm install');
  });
});

