import { sendJson } from '../utils/http.js';
import { ensureRepository } from '../core/git.js';
import type { RequestContext } from '../types/http.js';
import type { PlanService } from '../types/plan.js';

interface CreatePlanDependencies {
  ensureRepository: typeof ensureRepository;
  sendJson: typeof sendJson;
}

const defaultDependencies: CreatePlanDependencies = {
  ensureRepository,
  sendJson,
};

let activeDependencies: CreatePlanDependencies = { ...defaultDependencies };

/**
 * @internal Test hook to override create-plan dependencies
 */
export function __setCreatePlanTestOverrides(overrides?: Partial<CreatePlanDependencies>): void {
  if (!overrides) {
    activeDependencies = { ...defaultDependencies };
    return;
  }
  activeDependencies = { ...activeDependencies, ...overrides } as CreatePlanDependencies;
}

export function createPlanHandlers({ planService: providedPlanService }: { planService?: PlanService } = {}) {
  const planService = providedPlanService;

  async function create(context: RequestContext): Promise<void> {
    let payload;
    try {
      payload = await context.readJsonBody();
    } catch (error: unknown) {
      const err = error as Error;
      activeDependencies.sendJson(context.res, 400, { error: err.message });
      return;
    }

    const prompt = typeof payload['prompt'] === 'string' ? payload['prompt'] : '';
    if (!prompt.trim()) {
      activeDependencies.sendJson(context.res, 400, { error: 'prompt is required' });
      return;
    }

    const rawPrompt = payload && typeof payload['rawPrompt'] === 'boolean' ? payload['rawPrompt'] : false;
    const dangerousMode =
      payload && typeof payload['dangerousMode'] === 'boolean' ? payload['dangerousMode'] : false;

    if (!planService || !planService.isConfigured) {
      activeDependencies.sendJson(context.res, 500, {
        error:
          'Plan generation is not configured. Configure a local LLM command (set planLlm in config.json).',
      });
      return;
    }

    const org = typeof payload['org'] === 'string' ? payload['org'].trim() : '';
    const repo = typeof payload['repo'] === 'string' ? payload['repo'].trim() : '';
    let commandCwd = '';

    if ((org && !repo) || (!org && repo)) {
      activeDependencies.sendJson(context.res, 400, {
        error: 'Both org and repo must be provided when specifying repository context.',
      });
      return;
    }

    if (org && repo) {
      const workdir = typeof context.workdir === 'string' ? context.workdir : '';
      if (!workdir) {
        activeDependencies.sendJson(context.res, 500, {
          error: 'Server workdir is not configured.',
        });
        return;
      }
      try {
        const { repositoryPath } = await activeDependencies.ensureRepository(workdir, org, repo);
        commandCwd = repositoryPath;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        activeDependencies.sendJson(context.res, 404, { error: message });
        return;
      }
    }

    let planText;
    try {
      const options = commandCwd
        ? { prompt, cwd: commandCwd, rawPrompt, dangerousMode }
        : { prompt, rawPrompt, dangerousMode };
      planText = await planService.createPlanText(options);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'prompt is required') {
        activeDependencies.sendJson(context.res, 400, { error: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      activeDependencies.sendJson(context.res, 502, {
        error: message,
      });
      return;
    }
    activeDependencies.sendJson(context.res, 200, { plan: planText });
  }

  return { create };
}
