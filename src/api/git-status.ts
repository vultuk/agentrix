import { getWorktreeStatus, getWorktreeFileDiff } from '../core/git.js';
import { createQueryHandler } from './base-handler.js';
import { extractWorktreeParams } from '../validation/index.js';
import { ValidationError } from '../infrastructure/errors/index.js';
import type { RequestContext } from '../types/http.js';

interface GitStatusDependencies {
  getWorktreeStatus: typeof getWorktreeStatus;
  getWorktreeFileDiff: typeof getWorktreeFileDiff;
  extractWorktreeParams: typeof extractWorktreeParams;
}

const defaultDependencies: GitStatusDependencies = {
  getWorktreeStatus,
  getWorktreeFileDiff,
  extractWorktreeParams,
};

let activeDependencies: GitStatusDependencies = { ...defaultDependencies };

/**
 * @internal Test hook to override git-status dependencies
 */
export function __setGitStatusTestOverrides(overrides?: Partial<GitStatusDependencies>): void {
  if (!overrides) {
    activeDependencies = { ...defaultDependencies };
    return;
  }
  activeDependencies = { ...activeDependencies, ...overrides } as GitStatusDependencies;
}

function parseOptionalInteger(value: string | null, fallback: number | undefined): number | undefined {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

export function createGitStatusHandlers(workdir: string) {
  if (!workdir) {
    throw new Error('workdir is required');
  }

  const read = createQueryHandler(async (context: RequestContext) => {
    const { org, repo, branch } = activeDependencies.extractWorktreeParams(context.url.searchParams);
    const entryLimit = parseOptionalInteger(context.url.searchParams.get('entryLimit'), undefined);
    const commitLimit = parseOptionalInteger(context.url.searchParams.get('commitLimit'), undefined);

    const status = await activeDependencies.getWorktreeStatus(workdir, org, repo, branch, {
      entryLimit,
      commitLimit,
    });
    
    context.res.setHeader('Cache-Control', 'no-store');
    return { status };
  });

  const diff = createQueryHandler(async (context: RequestContext) => {
    const payload = await context.readJsonBody();
    const { org, repo, branch } = activeDependencies.extractWorktreeParams(
      new URLSearchParams({
        org: typeof payload['org'] === 'string' ? payload['org'] : '',
        repo: typeof payload['repo'] === 'string' ? payload['repo'] : '',
        branch: typeof payload['branch'] === 'string' ? payload['branch'] : '',
      })
    );

    const filePath = typeof payload['path'] === 'string' ? payload['path'] : '';
    if (!filePath) {
      throw new ValidationError('path is required');
    }

    const previousPath = typeof payload['previousPath'] === 'string' ? payload['previousPath'] : undefined;
    const mode = typeof payload['mode'] === 'string' ? payload['mode'] : undefined;
    const status = typeof payload['status'] === 'string' ? payload['status'] : undefined;

    return await activeDependencies.getWorktreeFileDiff(workdir, org, repo, branch, {
      path: filePath,
      previousPath,
      mode,
      status,
    });
  });

  return { read, diff };
}
