import { ensureRepository, countLocalWorktrees } from '../core/git.js';
import { createGithubClient } from '../core/github.js';
import { handleHeadRequest } from '../utils/http.js';
import { extractRepositoryParams } from '../validation/index.js';
import { createQueryHandler } from './base-handler.js';
import { HttpError } from '../infrastructure/errors/index.js';
import type { RequestContext } from '../types/http.js';

export interface RepoDashboardOverrides {
  githubClient?: ReturnType<typeof createGithubClient>;
  ensureRepo?: typeof ensureRepository;
  worktreeCounter?: typeof countLocalWorktrees;
  now?: () => Date;
}

export function createRepoDashboardHandlers(workdir: string, overrides: RepoDashboardOverrides = {}) {
  const {
    githubClient = createGithubClient(),
    ensureRepo = ensureRepository,
    worktreeCounter = countLocalWorktrees,
    now = () => new Date(),
  } = overrides;

  const read = createQueryHandler(async (context: RequestContext) => {
    const { org, repo } = extractRepositoryParams(context.url.searchParams);

    let repositoryPath;
    try {
      ({ repositoryPath } = await ensureRepo(workdir, org, repo));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const statusCode = message.includes('not found') ? 404 : 500;
      throw new HttpError(message, statusCode);
    }

    if (context.method === 'HEAD') {
      handleHeadRequest(context.res);
      return;
    }

    const [openPullRequests, openIssues, openIssueDetails, runningWorkflows] = await Promise.all([
      githubClient.countOpenPullRequests(org, repo),
      githubClient.countOpenIssues(org, repo),
      githubClient.listOpenIssues(org, repo),
      githubClient.countRunningWorkflows(org, repo),
    ]);

    const worktreeCount = await worktreeCounter(repositoryPath, { includeMain: false });
    const fetchedAt = now().toISOString();

    return {
      data: {
        org,
        repo,
        fetchedAt,
        pullRequests: { open: openPullRequests },
        issues: { open: openIssues, items: openIssueDetails },
        workflows: { running: runningWorkflows },
        worktrees: { local: worktreeCount },
      },
    };
  });

  return { read };
}
