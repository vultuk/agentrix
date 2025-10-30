import { getWorktreeStatus, getWorktreeFileDiff, normaliseBranchName } from '../core/git.js';
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

  async function diff(context) {
    let payload;
    try {
      payload = await context.readJsonBody();
    } catch (error) {
      sendJson(context.res, 400, { error: error.message });
      return;
    }

    const org = typeof payload.org === 'string' ? payload.org.trim() : '';
    const repo = typeof payload.repo === 'string' ? payload.repo.trim() : '';
    const branch = typeof payload.branch === 'string' ? payload.branch.trim() : '';
    const filePath = typeof payload.path === 'string' ? payload.path : '';
    const previousPath = typeof payload.previousPath === 'string' ? payload.previousPath : null;
    const mode = typeof payload.mode === 'string' ? payload.mode : '';
    const status = typeof payload.status === 'string' ? payload.status : '';

    if (!org || !repo || !branch || !filePath) {
      sendJson(context.res, 400, { error: 'org, repo, branch, and path are required' });
      return;
    }

    try {
      const result = await getWorktreeFileDiff(workdir, org, repo, branch, {
        path: filePath,
        previousPath,
        mode,
        status,
      });
      context.res.setHeader('Cache-Control', 'no-store');
      sendJson(context.res, 200, { diff: result });
    } catch (error) {
      const message = error && error.message ? error.message : 'Failed to generate diff';
      sendJson(context.res, 500, { error: message });
    }
  }

  return { read, diff };
}
