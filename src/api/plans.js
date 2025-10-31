import { getWorktreePath, normaliseBranchName } from '../core/git.js';
import { listPlansForWorktree, readPlanFromWorktree } from '../core/plan-storage.js';
import { sendJson } from '../utils/http.js';

function parseCommonParams(context) {
  const params = context.url.searchParams;
  const org = (params.get('org') || '').trim();
  const repo = (params.get('repo') || '').trim();
  const branchInput = (params.get('branch') || '').trim();

  if (!org || !repo || !branchInput) {
    sendJson(context.res, 400, { error: 'org, repo, and branch are required' });
    return null;
  }

  const branch = normaliseBranchName(branchInput);
  if (!branch) {
    sendJson(context.res, 400, { error: 'branch is invalid' });
    return null;
  }

  const limitParam = params.get('limit');
  const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
  if (limitParam && (Number.isNaN(limit) || limit < 1)) {
    sendJson(context.res, 400, { error: 'limit must be a positive integer' });
    return null;
  }

  return { org, repo, branch, limit };
}

function handleResolutionError(res, error) {
  const message = error?.message || 'Unknown error';
  if (/not found/i.test(message)) {
    sendJson(res, 404, { error: message });
    return;
  }
  sendJson(res, 500, { error: message });
}

export function createPlanArtifactHandlers(workdir) {
  async function list(context) {
    const parsed = parseCommonParams(context);
    if (!parsed) {
      return;
    }

    try {
      const { worktreePath } = await getWorktreePath(workdir, parsed.org, parsed.repo, parsed.branch);
      const plans = await listPlansForWorktree({
        worktreePath,
        branch: parsed.branch,
        limit: parsed.limit,
      });
      sendJson(context.res, 200, { data: plans });
    } catch (error) {
      handleResolutionError(context.res, error);
    }
  }

  async function read(context) {
    const parsed = parseCommonParams(context);
    if (!parsed) {
      return;
    }

    const planId = (context.url.searchParams.get('planId') || '').trim();
    if (!planId) {
      sendJson(context.res, 400, { error: 'planId is required' });
      return;
    }

    try {
      const { worktreePath } = await getWorktreePath(workdir, parsed.org, parsed.repo, parsed.branch);
      const plan = await readPlanFromWorktree({
        worktreePath,
        branch: parsed.branch,
        id: planId,
      });
      sendJson(context.res, 200, { data: plan });
    } catch (error) {
      handleResolutionError(context.res, error);
    }
  }

  return { list, read };
}
