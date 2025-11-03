import { ensureRepository } from '../core/git.js';
import { createGithubClient } from '../core/github.js';
import { sendJson } from '../utils/http.js';

export function createRepoIssueHandlers(workdir, overrides = {}) {
  const {
    githubClient = createGithubClient(),
    ensureRepo = ensureRepository,
    now = () => new Date(),
  } = overrides;

  async function read(context) {
    const org = context.url.searchParams.get('org')?.trim() || '';
    const repo = context.url.searchParams.get('repo')?.trim() || '';
    const issueParam = context.url.searchParams.get('issue')?.trim() || '';

    if (!org || !repo) {
      sendJson(context.res, 400, { error: 'org and repo query parameters are required' });
      return;
    }
    if (!issueParam) {
      sendJson(context.res, 400, { error: 'issue query parameter is required' });
      return;
    }

    const issueNumber = Number.parseInt(issueParam, 10);
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      sendJson(context.res, 400, { error: 'issue query parameter must be a positive integer' });
      return;
    }

    try {
      await ensureRepo(workdir, org, repo);
    } catch (error) {
      const message = error?.message || 'Repository not found';
      const statusCode = message.includes('not found') ? 404 : 500;
      sendJson(context.res, statusCode, { error: message });
      return;
    }

    if (context.method === 'HEAD') {
      context.res.statusCode = 200;
      context.res.setHeader('Cache-Control', 'no-store');
      context.res.end();
      return;
    }

    try {
      const issue = await githubClient.getIssue(org, repo, issueNumber);
      const fetchedAt = now().toISOString();
      sendJson(context.res, 200, {
        data: {
          org,
          repo,
          issue,
          fetchedAt,
        },
      });
    } catch (error) {
      const message = error?.message || 'Failed to read issue details';
      sendJson(context.res, 502, { error: message });
    }
  }

  return { read };
}
