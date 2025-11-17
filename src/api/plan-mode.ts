import { asyncHandler } from '../infrastructure/errors/index.js';
import { sendJson } from '../utils/http.js';
import { createHandler } from './base-handler.js';
import type { PlanModeService } from '../services/plan-mode-service.js';
import {
  validatePlanCreateInput,
  validatePlanIdentifyInput,
  validatePlanListInput,
  validatePlanUpdateInput,
  validatePlanDeleteInput,
} from '../validation/index.js';
import type { PlanRecord } from '../core/plan-mode-store.js';
import type { RequestContext } from '../types/http.js';

function toSummary(plan: PlanRecord) {
  return {
    id: plan.id,
    title: plan.title,
    status: plan.status,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    lastChange: plan.lastChange,
    source: plan.source,
    codexSessionId: plan.codexSessionId,
    worktreeBranch: plan.worktreeBranch,
    slug: plan.slug,
  };
}

function toDetail(plan: PlanRecord) {
  return {
    ...toSummary(plan),
    markdown: plan.markdown,
    defaultBranch: plan.defaultBranch,
  };
}

export function createPlanModeHandlers(planModeService: PlanModeService) {
  const list = asyncHandler(async (context: RequestContext) => {
    const input = validatePlanListInput(Object.fromEntries(context.url.searchParams.entries()));
    const plans = await planModeService.list(input.org, input.repo);
    sendJson(context.res, 200, { data: plans.map(toSummary) });
  });

  const create = createHandler({
    validator: validatePlanCreateInput,
    handler: async (input) => {
      const plan = await planModeService.create(input);
      return toDetail(plan);
    },
    successCode: 201,
    responseTransformer: (result) => ({ data: result }),
  });

  const read = asyncHandler(async (context: RequestContext) => {
    const params = validatePlanIdentifyInput(
      { id: context.params?.['id'] },
      Object.fromEntries(context.url.searchParams.entries()),
    );
    const plan = await planModeService.read(params.org, params.repo, params.id);
    if (!plan) {
      sendJson(context.res, 404, { error: 'Plan not found' });
      return;
    }
    sendJson(context.res, 200, { data: toDetail(plan) });
  });

  const update = createHandler({
    validator: validatePlanUpdateInput,
    handler: async (input) => {
      let plan: PlanRecord | null = null;
      if (typeof input.markdown === 'string') {
        plan = await planModeService.updateMarkdown({
          org: input.org,
          repo: input.repo,
          id: input.id,
          markdown: input.markdown,
          updatedBy: 'user',
        });
      }
      if (input.status) {
        plan = await planModeService.setStatus(input.org, input.repo, input.id, input.status);
      }
      if (!plan) {
        throw new Error('Plan update failed');
      }
      return toDetail(plan);
    },
    responseTransformer: (result) => ({ data: result }),
  });

  const startSession = asyncHandler(async (context: RequestContext) => {
    const params = validatePlanIdentifyInput(
      { id: context.params?.['id'] },
      Object.fromEntries(context.url.searchParams.entries()),
    );
    const plan = await planModeService.ensureSession(params.org, params.repo, params.id);
    sendJson(context.res, 200, { data: toDetail(plan) });
  });

  const build = asyncHandler(async (context: RequestContext) => {
    const params = validatePlanIdentifyInput(
      { id: context.params?.['id'] },
      Object.fromEntries(context.url.searchParams.entries()),
    );
    const result = await planModeService.buildPlan(params.org, params.repo, params.id);
    sendJson(context.res, 200, {
      data: {
        plan: toSummary(result.plan),
        taskId: result.taskId,
      },
    });
  });

  const destroy = createHandler({
    validator: validatePlanDeleteInput,
    handler: async (input) => {
      await planModeService.delete(input.org, input.repo, input.id);
      return { ok: true };
    },
    responseTransformer: (result) => result,
  });

  return {
    list,
    create,
    read,
    update,
    startSession,
    build,
    destroy,
  };
}
