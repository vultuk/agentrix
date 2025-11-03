import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createRepoIssueHandlers } from '../repo-issue.js';

function createContext({ method = 'GET', org, repo, issue } = {}) {
  const baseUrl = new URL('http://localhost/api/repos/issue');
  if (typeof org !== 'undefined') {
    baseUrl.searchParams.set('org', org);
  }
  if (typeof repo !== 'undefined') {
    baseUrl.searchParams.set('repo', repo);
  }
  if (typeof issue !== 'undefined') {
    baseUrl.searchParams.set('issue', issue);
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

test('returns issue details when repository exists and github client succeeds', async () => {
  const handlers = createRepoIssueHandlers('/work', {
    ensureRepo: async (root, org, repo) => {
      assert.equal(root, '/work');
      assert.equal(org, 'org');
      assert.equal(repo, 'repo');
      return { repositoryPath: '/work/org/repo/repository' };
    },
    githubClient: {
      getIssue: async (org, repo, number) => {
        assert.equal(org, 'org');
        assert.equal(repo, 'repo');
        assert.equal(number, 42);
        return {
          number,
          title: 'Add search',
          body: 'Body content',
          author: { login: 'octocat' },
          createdAt: '2024-01-01T10:00:00.000Z',
          updatedAt: '2024-01-02T12:00:00.000Z',
          labels: [{ name: 'enhancement', color: 'aabbcc' }],
          url: 'https://github.com/org/repo/issues/42',
          state: 'open',
        };
      },
    },
    now: () => new Date('2024-01-03T09:30:00Z'),
  });

  const context = createContext({ method: 'GET', org: 'org', repo: 'repo', issue: '42' });
  await handlers.read(context);

  assert.equal(context.res.statusCode, 200);
  assert.equal(context.res.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(context.res.ended, true);

  const payload = JSON.parse(context.res.body);
  assert.deepEqual(payload, {
    data: {
      org: 'org',
      repo: 'repo',
      fetchedAt: '2024-01-03T09:30:00.000Z',
      issue: {
        number: 42,
        title: 'Add search',
        body: 'Body content',
        author: { login: 'octocat' },
        createdAt: '2024-01-01T10:00:00.000Z',
        updatedAt: '2024-01-02T12:00:00.000Z',
        labels: [{ name: 'enhancement', color: 'aabbcc' }],
        url: 'https://github.com/org/repo/issues/42',
        state: 'open',
      },
    },
  });
});

test('returns 400 when org or repo are missing', async () => {
  const handlers = createRepoIssueHandlers('/work', {});

  const context = createContext({ method: 'GET', issue: '1' });
  await handlers.read(context);

  assert.equal(context.res.statusCode, 400);
  const payload = JSON.parse(context.res.body);
  assert.equal(payload.error, 'org and repo query parameters are required');
});

test('returns 400 when issue query parameter is invalid', async () => {
  const handlers = createRepoIssueHandlers('/work');

  const context = createContext({ method: 'GET', org: 'org', repo: 'repo', issue: 'abc' });
  await handlers.read(context);

  assert.equal(context.res.statusCode, 400);
  const payload = JSON.parse(context.res.body);
  assert.equal(payload.error, 'issue query parameter must be a positive integer');
});

test('returns 404 when repository is missing locally', async () => {
  const handlers = createRepoIssueHandlers('/work', {
    ensureRepo: async () => {
      throw new Error('Repository not found for org/repo');
    },
  });

  const context = createContext({ method: 'GET', org: 'org', repo: 'repo', issue: '5' });
  await handlers.read(context);

  assert.equal(context.res.statusCode, 404);
  const payload = JSON.parse(context.res.body);
  assert.equal(payload.error, 'Repository not found for org/repo');
});

test('returns 502 when github client fails', async () => {
  const handlers = createRepoIssueHandlers('/work', {
    ensureRepo: async () => ({}),
    githubClient: {
      getIssue: async () => {
        throw new Error('GitHub CLI command failed');
      },
    },
  });

  const context = createContext({ method: 'GET', org: 'org', repo: 'repo', issue: '7' });
  await handlers.read(context);

  assert.equal(context.res.statusCode, 502);
  const payload = JSON.parse(context.res.body);
  assert.equal(payload.error, 'GitHub CLI command failed');
});

test('HEAD requests validate repository and exit without fetching issue details', async () => {
  let getIssueCalled = false;
  const handlers = createRepoIssueHandlers('/work', {
    ensureRepo: async () => ({}),
    githubClient: {
      getIssue: async () => {
        getIssueCalled = true;
        return {};
      },
    },
  });

  const context = createContext({ method: 'HEAD', org: 'org', repo: 'repo', issue: '10' });
  await handlers.read(context);

  assert.equal(context.res.statusCode, 200);
  assert.equal(context.res.body, '');
  assert.equal(context.res.ended, true);
  assert.equal(context.res.headers['cache-control'], 'no-store');
  assert.equal(getIssueCalled, false);
});
