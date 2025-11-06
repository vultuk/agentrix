import type { ServerResponse } from 'node:http';
import { getWorktreePath } from '../core/git.js';
import { listPlansForWorktree, readPlanFromWorktree } from '../core/plan-storage.js';
import { sendJson } from '../utils/http.js';
import { extractWorktreeParams } from '../validation/index.js';
import { ValidationError, extractErrorMessage } from '../infrastructure/errors/index.js';
import type { RequestContext } from '../types/http.js';

interface PlansDependencies {
  getWorktreePath: typeof getWorktreePath;
  listPlansForWorktree: typeof listPlansForWorktree;
  readPlanFromWorktree: typeof readPlanFromWorktree;
  extractWorktreeParams: typeof extractWorktreeParams;
  sendJson: typeof sendJson;
  extractErrorMessage: typeof extractErrorMessage;
}

const defaultDependencies: PlansDependencies = {
  getWorktreePath,
  listPlansForWorktree,
  readPlanFromWorktree,
  extractWorktreeParams,
  sendJson,
  extractErrorMessage,
};

let activeDependencies: PlansDependencies = { ...defaultDependencies };

/**
 * @internal Test hook to override plans dependencies
 */
export function __setPlansTestOverrides(overrides?: Partial<PlansDependencies>): void {
  if (!overrides) {
    activeDependencies = { ...defaultDependencies };
    return;
  }
  activeDependencies = { ...activeDependencies, ...overrides } as PlansDependencies;
}

interface ParsedParams {
  org: string;
  repo: string;
  branch: string;
  limit?: number;
}

function parseCommonParams(context: RequestContext): ParsedParams | null {
  try {
    const { org, repo, branch } = activeDependencies.extractWorktreeParams(context.url.searchParams);
    
    const limitParam = context.url.searchParams.get('limit');
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    if (limitParam && (Number.isNaN(limit) || (limit && limit < 1))) {
      activeDependencies.sendJson(context.res, 400, { error: 'limit must be a positive integer' });
      return null;
    }

    return { org, repo, branch, limit };
  } catch (error: unknown) {
    const message = error instanceof ValidationError ? error.message : activeDependencies.extractErrorMessage(error, 'Invalid parameters');
    activeDependencies.sendJson(context.res, 400, { error: message });
    return null;
  }
}

function handleResolutionError(res: ServerResponse, error: unknown): void {
  const message = activeDependencies.extractErrorMessage(error, 'Unknown error');
  if (/not found/i.test(message)) {
    activeDependencies.sendJson(res, 404, { error: message });
    return;
  }
  activeDependencies.sendJson(res, 500, { error: message });
}

export function createPlanArtifactHandlers(workdir: string) {
  async function list(context: RequestContext): Promise<void> {
    const parsed = parseCommonParams(context);
    if (!parsed) {
      return;
    }

    try {
      const { worktreePath } = await activeDependencies.getWorktreePath(workdir, parsed.org, parsed.repo, parsed.branch);
      const plans = await activeDependencies.listPlansForWorktree({
        worktreePath,
        branch: parsed.branch,
        limit: parsed.limit,
      });
      activeDependencies.sendJson(context.res, 200, { data: plans });
    } catch (error: unknown) {
      handleResolutionError(context.res, error);
    }
  }

  async function read(context: RequestContext): Promise<void> {
    const parsed = parseCommonParams(context);
    if (!parsed) {
      return;
    }

    const planId = (context.url.searchParams.get('planId') || '').trim();
    if (!planId) {
      activeDependencies.sendJson(context.res, 400, { error: 'planId is required' });
      return;
    }

    try {
      const { worktreePath } = await activeDependencies.getWorktreePath(workdir, parsed.org, parsed.repo, parsed.branch);
      const plan = await activeDependencies.readPlanFromWorktree({
        worktreePath,
        branch: parsed.branch,
        id: planId,
      });
      activeDependencies.sendJson(context.res, 200, { data: plan });
    } catch (error: unknown) {
      handleResolutionError(context.res, error);
    }
  }

  return { list, read };
}
