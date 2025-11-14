import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  cloneRepository,
  createWorktree,
  ensureRepository,
  getWorktreePath,
} from '../core/git.js';
import { launchAgentProcess } from '../core/agents.js';
import { runTask } from '../core/tasks.js';
import { getClientIp, sendJson } from '../utils/http.js';
import {
  validateAutomationRequest,
  AutomationRequestError,
  extractApiKey,
} from '../core/automation/request-validation.js';
import { resolveBranchName } from '../core/automation/branch.js';
import { generatePlanText } from '../core/automation/plan.js';
import { createGitOrchestrator } from '../core/automation/git-orchestration.js';
import { runAutomationTask } from '../core/automation/task-runner.js';
import { createLogger } from '../infrastructure/logging/index.js';
import { createRateLimiter } from '../core/security/rate-limiter.js';
import {
  AUTOMATION_RATE_LIMIT_MAX_ATTEMPTS,
  AUTOMATION_RATE_LIMIT_WINDOW_MS,
  ERROR_MESSAGES,
  HTTP_STATUS,
} from '../config/constants.js';
import type { Logger } from '../infrastructure/logging/index.js';
import type { RateLimiter } from '../core/security/rate-limiter.js';

interface AutomationModuleDependencies {
  cloneRepository: typeof cloneRepository;
  ensureRepository: typeof ensureRepository;
  getWorktreePath: typeof getWorktreePath;
  createWorktree: typeof createWorktree;
  launchAgentProcess: typeof launchAgentProcess;
  runTask: typeof runTask;
  validateAutomationRequest: typeof validateAutomationRequest;
  resolveBranchName: typeof resolveBranchName;
  generatePlanText: typeof generatePlanText;
  createGitOrchestrator: typeof createGitOrchestrator;
  runAutomationTask: typeof runAutomationTask;
  createLogger: typeof createLogger;
  createRateLimiter: typeof createRateLimiter;
}

const defaultAutomationDependencies: AutomationModuleDependencies = {
  cloneRepository,
  ensureRepository,
  getWorktreePath,
  createWorktree,
  launchAgentProcess,
  runTask,
  validateAutomationRequest,
  resolveBranchName,
  generatePlanText,
  createGitOrchestrator,
  runAutomationTask,
  createLogger,
  createRateLimiter,
};

let activeAutomationDependencies: AutomationModuleDependencies = { ...defaultAutomationDependencies };

/**
 * @internal Test hook to override automation dependencies
 */
export function __setAutomationTestOverrides(overrides?: Partial<AutomationModuleDependencies>): void {
  if (!overrides) {
    activeAutomationDependencies = { ...defaultAutomationDependencies };
    return;
  }
  activeAutomationDependencies = {
    ...activeAutomationDependencies,
    ...overrides,
  } as AutomationModuleDependencies;
}

export async function ensureRepositoryExists(
  workdir: string,
  org: string,
  repo: string
): Promise<{ repositoryPath: string; cloned: boolean }> {
  try {
    const { repositoryPath } = await activeAutomationDependencies.ensureRepository(workdir, org, repo);
    return { repositoryPath, cloned: false };
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (err && /Repository not found/i.test(err.message || '')) {
      const remote = `git@github.com:${org}/${repo}.git`;
      await activeAutomationDependencies.cloneRepository(workdir, remote);
      const { repositoryPath } = await activeAutomationDependencies.ensureRepository(workdir, org, repo);
      return { repositoryPath, cloned: true };
    }
    throw error;
  }
}

export async function ensureWorktreeExists(
  workdir: string,
  org: string,
  repo: string,
  branch: string,
  options: unknown = {}
): Promise<{ worktreePath: string; created: boolean }> {
  try {
    const { worktreePath } = await activeAutomationDependencies.getWorktreePath(workdir, org, repo, branch);
    return { worktreePath, created: false };
  } catch (error: unknown) {
    const err = error as { message?: string };
    if (err && /worktree .* not found/i.test(err.message || '')) {
      await activeAutomationDependencies.createWorktree(workdir, org, repo, branch, options as never);
      const { worktreePath } = await activeAutomationDependencies.getWorktreePath(workdir, org, repo, branch);
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
  rateLimiter?: RateLimiter;
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
    launchAgentProcess: launchAgent = activeAutomationDependencies.launchAgentProcess,
    runTaskImpl = activeAutomationDependencies.runTask,
    now = () => Date.now(),
    createRequestId = () => randomUUID(),
    rateLimiter: injectedRateLimiter,
  }: AutomationHandlersDependencies = {}
) {
  const gitOrchestrator = activeAutomationDependencies.createGitOrchestrator({
    ensureRepositoryExists: ensureRepoExists,
    ensureWorktreeExists: ensureWorktree,
  });

  const log = activeAutomationDependencies.createLogger(logger);
  const automationRateLimiter =
    injectedRateLimiter ||
    activeAutomationDependencies.createRateLimiter({
      windowMs: AUTOMATION_RATE_LIMIT_WINDOW_MS,
      maxAttempts: AUTOMATION_RATE_LIMIT_MAX_ATTEMPTS,
    });

  async function launch(context: { req: unknown; res: unknown; readJsonBody: () => Promise<unknown> }): Promise<void> {
    const req = context.req as IncomingMessage;
    const ctx = context as {
      req: { headers?: Record<string, string | string[] | undefined> };
      res: { statusCode?: number; setHeader?: (name: string, value: string) => void; end?: (data?: unknown) => void };
      readJsonBody: () => Promise<unknown>;
    };
    const providedApiKey = extractApiKey(req);
    const clientIp = getClientIp(req);
    const limiterKey = clientIp;

    const limiterStatus = automationRateLimiter.check(limiterKey);
    if (limiterStatus.limited) {
      log.warn('[agentrix] Automation request throttled', {
        clientIp,
        apiKeyProvided: Boolean(providedApiKey),
        attempts: limiterStatus.attempts,
        retryAfterMs: limiterStatus.retryAfterMs,
      });
      sendJson(ctx.res as unknown as ServerResponse, HTTP_STATUS.TOO_MANY_REQUESTS, {
        error: ERROR_MESSAGES.TOO_MANY_AUTOMATION_ATTEMPTS,
      });
      return;
    }
    let validation;
    try {
      validation = await activeAutomationDependencies.validateAutomationRequest({
        req: ctx.req,
        expectedApiKey: apiKey || '',
        readJsonBody: ctx.readJsonBody,
        agentCommands,
      });
    } catch (error: unknown) {
      if (error instanceof AutomationRequestError) {
        if (error.status === 401) {
          const failure = automationRateLimiter.recordFailure(limiterKey);
          if (failure.limited) {
            log.warn('[agentrix] Automation rate limit triggered', {
              clientIp,
              apiKeyProvided: Boolean(providedApiKey),
              attempts: failure.attempts,
              retryAfterMs: failure.retryAfterMs,
            });
            sendJson(ctx.res as unknown as ServerResponse, HTTP_STATUS.TOO_MANY_REQUESTS, {
              error: ERROR_MESSAGES.TOO_MANY_AUTOMATION_ATTEMPTS,
            });
            return;
          }
        }
        sendJson(ctx.res as unknown as ServerResponse, error.status, { error: error.message });
        return;
      }
      log.error('[agentrix] Automation validation failed unexpectedly.', error);
      sendJson(ctx.res as unknown as ServerResponse, 500, { error: 'Unexpected error while validating automation request' });
      return;
    }

    automationRateLimiter.reset(limiterKey);

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
      const result = (await activeAutomationDependencies.runAutomationTask({
        runTaskImpl: runTaskImpl as never,
        resolveBranchName: activeAutomationDependencies.resolveBranchName as never,
        generatePlanText: activeAutomationDependencies.generatePlanText as never,
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
