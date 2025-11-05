import { randomUUID } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import {
  cloneRepository,
  createWorktree,
  ensureRepository,
  getWorktreePath,
} from '../core/git.js';
import { launchAgentProcess } from '../core/agents.js';
import { runTask } from '../core/tasks.js';
import { sendJson } from '../utils/http.js';
import {
  validateAutomationRequest,
  AutomationRequestError,
} from '../core/automation/request-validation.js';
import { resolveBranchName } from '../core/automation/branch.js';
import { generatePlanText } from '../core/automation/plan.js';
import { createGitOrchestrator } from '../core/automation/git-orchestration.js';
import { runAutomationTask } from '../core/automation/task-runner.js';
import { createLogger } from '../infrastructure/logging/index.js';
import type { Logger } from '../infrastructure/logging/index.js';

async function ensureRepositoryExists(
  workdir: string,
  org: string,
  repo: string
): Promise<{ repositoryPath: string; cloned: boolean }> {
  try {
    const { repositoryPath } = await ensureRepository(workdir, org, repo);
    return { repositoryPath, cloned: false };
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (err && /Repository not found/i.test(err.message || '')) {
      const remote = `git@github.com:${org}/${repo}.git`;
      await cloneRepository(workdir, remote);
      const { repositoryPath } = await ensureRepository(workdir, org, repo);
      return { repositoryPath, cloned: true };
    }
    throw error;
  }
}

async function ensureWorktreeExists(
  workdir: string,
  org: string,
  repo: string,
  branch: string,
  options: unknown = {}
): Promise<{ worktreePath: string; created: boolean }> {
  try {
    const { worktreePath } = await getWorktreePath(workdir, org, repo, branch);
    return { worktreePath, created: false };
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (err && /worktree .* not found/i.test(err.message || '')) {
      await createWorktree(workdir, org, repo, branch, options as never);
      const { worktreePath } = await getWorktreePath(workdir, org, repo, branch);
      return { worktreePath, created: true };
    }
    throw error;
  }
}

export const automationPlanMetrics = {
  planTrue: {
    requests: 0,
    successes: 0,
    failures: 0,
    totalLatencyMs: 0,
  },
  planFalse: {
    requests: 0,
    successes: 0,
    failures: 0,
    totalLatencyMs: 0,
  },
};

export function resetAutomationPlanMetrics() {
  for (const bucket of Object.values(automationPlanMetrics)) {
    bucket.requests = 0;
    bucket.successes = 0;
    bucket.failures = 0;
    bucket.totalLatencyMs = 0;
  }
}

function finishMetrics(key: 'planTrue' | 'planFalse', success: boolean, durationMs: number): void {
  const bucket = automationPlanMetrics[key];
  if (!bucket) {
    return;
  }
  if (success) {
    bucket.successes += 1;
  } else {
    bucket.failures += 1;
  }
  bucket.totalLatencyMs += durationMs;
}

export interface AutomationHandlersConfig {
  workdir: string;
  agentCommands: unknown;
  apiKey?: string;
  branchNameGenerator: unknown;
  planService: unknown;
  logger?: Logger;
  defaultBranches: unknown;
}

export interface AutomationHandlersDependencies {
  ensureRepositoryExists?: typeof ensureRepositoryExists;
  ensureWorktreeExists?: typeof ensureWorktreeExists;
  launchAgentProcess?: typeof launchAgentProcess;
  runTaskImpl?: typeof runTask;
  now?: () => number;
  createRequestId?: () => string;
}

export function createAutomationHandlers(
  {
    workdir,
    agentCommands,
    apiKey,
    branchNameGenerator,
    planService,
    logger,
    defaultBranches,
  }: AutomationHandlersConfig,
  {
    ensureRepositoryExists: ensureRepoExists = ensureRepositoryExists,
    ensureWorktreeExists: ensureWorktree = ensureWorktreeExists,
    launchAgentProcess: launchAgent = launchAgentProcess,
    runTaskImpl = runTask,
    now = () => Date.now(),
    createRequestId = () => randomUUID(),
  }: AutomationHandlersDependencies = {}
) {
  const gitOrchestrator = createGitOrchestrator({
    ensureRepositoryExists: ensureRepoExists,
    ensureWorktreeExists: ensureWorktree,
  });

  const log = createLogger(logger);

  async function launch(context: { req: unknown; res: unknown; readJsonBody: () => Promise<unknown> }): Promise<void> {
    const ctx = context as { req: { headers?: Record<string, string | string[] | undefined> }; res: { statusCode?: number; setHeader?: (name: string, value: string) => void; end?: (data?: unknown) => void }; readJsonBody: () => Promise<unknown> };
    let validation;
    try {
      validation = await validateAutomationRequest({
        req: ctx.req,
        expectedApiKey: apiKey || '',
        readJsonBody: ctx.readJsonBody,
        agentCommands,
      });
    } catch (error: unknown) {
      if (error instanceof AutomationRequestError) {
        sendJson(ctx.res as unknown as ServerResponse, error.status, { error: error.message });
        return;
      }
      log.error('[agentrix] Automation validation failed unexpectedly.', error);
      sendJson(ctx.res as unknown as ServerResponse, 500, { error: 'Unexpected error while validating automation request' });
      return;
    }

    const { planEnabled, prompt, org, repo, worktreeInput, agent, routeLabel } = validation;

    const metricsKey = planEnabled ? 'planTrue' : 'planFalse';
    automationPlanMetrics[metricsKey].requests += 1;

    const requestId = createRequestId();
    const startedAt = now();

    const elapsedMs = () => {
      const value = now() - startedAt;
      return Number.isFinite(value) ? value : 0;
    };

    const finishSuccess = (detail?: string): void => {
      const durationMs = elapsedMs();
      finishMetrics(metricsKey, true, durationMs);
      const suffix = detail ? `: ${detail}` : '';
      log.info(
        `[agentrix] Automation request ${requestId} (${routeLabel}) completed in ${durationMs}ms${suffix}`,
      );
    };

    const finishFailure = (message: string, error?: unknown): void => {
      const durationMs = elapsedMs();
      finishMetrics(metricsKey, false, durationMs);
      if (error) {
        log.error(
          `[agentrix] Automation request ${requestId} (${routeLabel}) failed after ${durationMs}ms: ${message}`,
          error,
        );
      } else {
        log.error(
          `[agentrix] Automation request ${requestId} (${routeLabel}) failed after ${durationMs}ms: ${message}`,
        );
      }
    };

    log.info(`[agentrix] Automation request ${requestId} (${routeLabel}) received.`);

    if (planEnabled && !prompt.trim()) {
      const message = 'prompt is required when plan is true';
      finishFailure(message);
      sendJson(ctx.res as unknown as ServerResponse, 400, { error: message });
      return;
    }

    const service = planService as { isConfigured?: boolean };
    if (planEnabled && (!service || !service.isConfigured)) {
      const message =
        'Plan generation is not configured. Configure a local LLM command (set planLlm in config.json).';
      finishFailure(message);
      sendJson(ctx.res as unknown as ServerResponse, 503, { error: message });
      return;
    }

    try {
      const result = (await runAutomationTask({
        runTaskImpl: runTaskImpl as never,
        resolveBranchName: resolveBranchName as never,
        generatePlanText: generatePlanText as never,
        gitOrchestrator,
        launchAgent: launchAgent as never,
        workdir,
        planEnabled,
        routeLabel,
        prompt,
        org,
        repo,
        agent: agent as unknown as string,
        requestId,
        worktreeInput,
        branchNameGenerator,
        defaultBranches,
        planService,
        finishSuccess: finishSuccess as never,
        finishFailure: finishFailure as never,
        onBranchResolved: (branch: string) => {
          log.info(
            `[agentrix] Automation request ${requestId} (${routeLabel}) targeting ${org}/${repo}#${branch}.`,
          );
        },
      })) as unknown as { taskId: string; queuedData: unknown };

      sendJson(ctx.res as unknown as ServerResponse, 202, { taskId: result.taskId, data: result.queuedData });
    } catch (error: unknown) {
      const status =
        error instanceof AutomationRequestError && typeof error.status === 'number'
          ? error.status
          : 500;
      const message = error instanceof Error ? error.message : String(error);
      finishFailure(message, error instanceof Error ? error : undefined);
      sendJson(ctx.res as unknown as ServerResponse, status, { error: message });
    }
  }

  return { launch };
}
