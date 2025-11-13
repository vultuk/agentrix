import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveRepositoryPaths } from './repository-paths.js';
import { RepositoryIdentifierError } from '../domain/index.js';

describe('resolveRepositoryPaths', () => {
  it('normalizes segments and resolves paths inside workdir', () => {
    const result = resolveRepositoryPaths('/workdir', ' acme ', ' demo ');

    assert.equal(result.repoRoot, '/workdir/acme/demo');
    assert.equal(result.repositoryPath, '/workdir/acme/demo/repository');
  });

  it('rejects traversal tokens in org or repo', () => {
    assert.throws(
      () => resolveRepositoryPaths('/workdir', '..', 'demo'),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryIdentifierError);
        assert.match(error.message, /organization cannot be a traversal segment/i);
        return true;
      }
    );

    assert.throws(
      () => resolveRepositoryPaths('/workdir', 'acme', '../demo'),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryIdentifierError);
        assert.match(error.message, /repository cannot (?:be a traversal segment|contain path separators)/i);
        return true;
      }
    );
  });

  it('requires a workdir value', () => {
    assert.throws(
      () => resolveRepositoryPaths('', 'acme', 'demo'),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryIdentifierError);
        assert.match(error.message, /Workdir is required/);
        return true;
      }
    );
  });
});
