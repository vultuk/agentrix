import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRepoDashboardHandlers } from '../repo-dashboard.js';

function createContext({ method = 'GET', org, repo } = {}) {
  const baseUrl = new URL('http://localhost/api/repos/dashboard');
  if (typeof org !== 'undefined') {
    baseUrl.searchParams.set('org', org);
  }
  if (typeof repo !== 'undefined') {
    baseUrl.searchParams.set('repo', repo);
  }

  const res = {
    statusCode: 0,
    headers: {},
    ended: false,
    body: '',
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
    url: baseUrl,
    res,
  };
}

test('returns dashboard metrics when repository and github client succeed', async () => {
  const handlers = createRepoDashboardHandlers('/work', {
    ensureRepo: async () => ({ repositoryPath: '/work/org/repo/repository' }),
    worktreeCounter: async () => 5,
    githubClient: {
      countOpenPullRequests: async (org, repo) => {
        assert.equal(org, 'org');
        assert.equal(repo, 'repo');
        return 3;
      },
      countOpenIssues: async () => 7,
      countRunningWorkflows: async () => 2,
    },
    now: () => new Date('2024-01-01T12:00:00Z'),
  });

  const context = createContext({ method: 'GET', org: 'org', repo: 'repo' });
  await handlers.read(context);

  assert.equal(context.res.statusCode, 200);
  assert.equal(context.res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(context.res.ended, true);

  const payload = JSON.parse(context.res.body);
  assert.deepEqual(payload, {
    data: {
      org: 'org',
      repo: 'repo',
      fetchedAt: '2024-01-01T12:00:00.000Z',
      pullRequests: { open: 3 },
      issues: { open: 7 },
      workflows: { running: 2 },
      worktrees: { local: 5 },
    },
  });
});

test('returns 400 when org or repo are missing', async () => {
  const handlers = createRepoDashboardHandlers('/work');

  const context = createContext({ method: 'GET' });
  await handlers.read(context);

  assert.equal(context.res.statusCode, 400);
  const payload = JSON.parse(context.res.body);
  assert.equal(payload.error, 'org and repo query parameters are required');
});

test('returns 404 when repository is missing locally', async () => {
  const handlers = createRepoDashboardHandlers('/work', {
    ensureRepo: async () => {
      throw new Error('Repository not found for org/repo');
    },
  });

  const context = createContext({ method: 'GET', org: 'org', repo: 'repo' });
  await handlers.read(context);

  assert.equal(context.res.statusCode, 404);
  const payload = JSON.parse(context.res.body);
  assert.equal(payload.error, 'Repository not found for org/repo');
});

test('returns 502 on GitHub CLI errors', async () => {
  const handlers = createRepoDashboardHandlers('/work', {
    ensureRepo: async () => ({ repositoryPath: '/work/org/repo/repository' }),
    worktreeCounter: async () => 0,
    githubClient: {
      countOpenPullRequests: async () => {
        throw new Error('GitHub CLI command failed');
      },
      countOpenIssues: async () => 0,
      countRunningWorkflows: async () => 0,
    },
  });

  const context = createContext({ method: 'GET', org: 'org', repo: 'repo' });
  await handlers.read(context);

  assert.equal(context.res.statusCode, 502);
  const payload = JSON.parse(context.res.body);
  assert.equal(payload.error, 'GitHub CLI command failed');
});

test('HEAD requests validate repository and exit without body', async () => {
  const handlers = createRepoDashboardHandlers('/work', {
    ensureRepo: async () => ({ repositoryPath: '/path' }),
  });

  const context = createContext({ method: 'HEAD', org: 'org', repo: 'repo' });
  await handlers.read(context);

  assert.equal(context.res.statusCode, 200);
  assert.equal(context.res.body, '');
  assert.equal(context.res.ended, true);
});

