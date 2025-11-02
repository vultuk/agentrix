import { ensureRepository, countLocalWorktrees } from '../core/git.js';
import { createGithubClient } from '../core/github.js';
import { sendJson } from '../utils/http.js';

export function createRepoDashboardHandlers(workdir, overrides = {}) {
  const {
    githubClient = createGithubClient(),
    ensureRepo = ensureRepository,
    worktreeCounter = countLocalWorktrees,
    now = () => new Date(),
  } = overrides;

  async function read(context) {
    const org = context.url.searchParams.get('org')?.trim() || '';
    const repo = context.url.searchParams.get('repo')?.trim() || '';

    if (!org || !repo) {
      sendJson(context.res, 400, { error: 'org and repo query parameters are required' });
      return;
    }

    let repositoryPath;
    try {
      ({ repositoryPath } = await ensureRepo(workdir, org, repo));
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
      const [openPullRequests, openIssues, openIssueDetails, runningWorkflows] = await Promise.all([
        githubClient.countOpenPullRequests(org, repo),
        githubClient.countOpenIssues(org, repo),
        githubClient.listOpenIssues(org, repo),
        githubClient.countRunningWorkflows(org, repo),
      ]);

      const worktreeCount = await worktreeCounter(repositoryPath, { includeMain: false });
      const fetchedAt = now().toISOString();

      sendJson(context.res, 200, {
        data: {
          org,
          repo,
          fetchedAt,
          pullRequests: { open: openPullRequests },
          issues: { open: openIssues, items: openIssueDetails },
          workflows: { running: runningWorkflows },
          worktrees: { local: worktreeCount },
        },
      });
    } catch (error) {
      const message = error?.message || 'Failed to load repository dashboard metrics';
      sendJson(context.res, 502, { error: message });
    }
  }

  return { read };
}
