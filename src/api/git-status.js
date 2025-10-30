import { getWorktreeStatus, normaliseBranchName } from '../core/git.js';
import { sendJson } from '../utils/http.js';

function parseOptionalInteger(value, fallback) {
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

export function createGitStatusHandlers(workdir) {
  if (!workdir) {
    throw new Error('workdir is required');
  }

  async function read(context) {
    const { searchParams } = context.url;
    const org = (searchParams.get('org') || '').trim();
    const repo = (searchParams.get('repo') || '').trim();
    const branchParam = searchParams.get('branch') || '';
    const branch = normaliseBranchName(branchParam);
    const entryLimit = parseOptionalInteger(searchParams.get('entryLimit'), undefined);
    const commitLimit = parseOptionalInteger(searchParams.get('commitLimit'), undefined);

    if (!org || !repo || !branch) {
      sendJson(context.res, 400, { error: 'org, repo, and branch are required' });
      return;
    }

    try {
      const status = await getWorktreeStatus(workdir, org, repo, branch, {
        entryLimit,
        commitLimit,
      });
      context.res.setHeader('Cache-Control', 'no-store');
      sendJson(context.res, 200, { status });
    } catch (error) {
      const message = error && error.message ? error.message : 'Failed to read git status';
      sendJson(context.res, 500, { error: message });
    }
  }

  return { read };
}
