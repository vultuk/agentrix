import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GitUrl, parseRepositoryUrl } from './git-url-parser.js';

describe('parseRepositoryUrl', () => {
  it('parses SSH Git URLs', () => {
    const result = parseRepositoryUrl('git@github.com:vultuk/agentrix.git');

    assert.equal(result.org, 'vultuk');
    assert.equal(result.repo, 'agentrix');
    assert.equal(result.url, 'git@github.com:vultuk/agentrix.git');
  });

  it('parses HTTPS Git URLs and strips .git suffix', () => {
    const result = parseRepositoryUrl('https://github.com/vultuk/agentrix.git');

    assert.equal(result.org, 'vultuk');
    assert.equal(result.repo, 'agentrix');
  });

  it('parses file system style paths', () => {
    const result = parseRepositoryUrl('/repos/vultuk/agentrix');

    assert.equal(result.org, 'vultuk');
    assert.equal(result.repo, 'agentrix');
  });

  it('parses alternative colon separated SSH paths', () => {
    const result = parseRepositoryUrl('git@example.com:vultuk/agentrix.git');

    assert.equal(result.org, 'vultuk');
    assert.equal(result.repo, 'agentrix');
  });

  it('throws for invalid inputs', () => {
    assert.throws(() => parseRepositoryUrl(''), /Repository URL is required/);
    assert.throws(() => parseRepositoryUrl('example'), /Unable to determine repository/);
  });
});

describe('GitUrl', () => {
  it('exposes parsed properties and helpers', () => {
    const url = new GitUrl('git@github.com:vultuk/agentrix.git');

    assert.equal(url.org, 'vultuk');
    assert.equal(url.repo, 'agentrix');
    assert.equal(url.toString(), 'git@github.com:vultuk/agentrix.git');
    assert.equal(url.toIdentifier(), 'vultuk/agentrix');
  });
});

