import { ensureRepository } from '../core/git.js';
import { createGithubClient } from '../core/github.js';
import { sendJson, handleHeadRequest } from '../utils/http.js';
import { extractRepositoryParams } from '../validation/index.js';
import { extractErrorMessage } from '../infrastructure/errors/index.js';
import { createQueryHandler } from './base-handler.js';
import type { RequestContext } from '../types/http.js';

export interface RepoIssueOverrides {
  githubClient?: ReturnType<typeof createGithubClient>;
  ensureRepo?: typeof ensureRepository;
  now?: () => Date;
}

export function createRepoIssueHandlers(workdir: string, overrides: RepoIssueOverrides = {}) {
  const {
    githubClient = createGithubClient(),
    ensureRepo = ensureRepository,
    now = () => new Date(),
  } = overrides;

  const read = createQueryHandler(async (context: RequestContext) => {
    const { org, repo } = extractRepositoryParams(context.url.searchParams);
    const issueParam = context.url.searchParams.get('issue')?.trim() || '';

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
    } catch (error: unknown) {
      const message = extractErrorMessage(error, 'Repository not found');
      const statusCode = message.includes('not found') ? 404 : 500;
      sendJson(context.res, statusCode, { error: message });
      return;
    }

    if (context.method === 'HEAD') {
      handleHeadRequest(context.res);
      return;
    }

    const issue = await githubClient.getIssue(org, repo, issueNumber);
    const fetchedAt = now().toISOString();
    
    return {
      data: {
        org,
        repo,
        issue,
        fetchedAt,
      },
    };
  });

  return { read };
}
