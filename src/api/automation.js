import { randomUUID } from 'node:crypto';
import {
  cloneRepository,
  createWorktree,
  ensureRepository,
  getWorktreePath,
  discoverRepositories,
} from '../core/git.js';
import { launchAgentProcess } from '../core/agents.js';
import { runTask } from '../core/tasks.js';
import { sendJson } from '../utils/http.js';
import { emitReposUpdate } from '../core/event-bus.js';
import {
  validateAutomationRequest,
  AutomationRequestError,
} from '../core/automation/request-validation.js';
import { resolveBranchName } from '../core/automation/branch.js';
import { generatePlanText } from '../core/automation/plan.js';
import { createGitOrchestrator } from '../core/automation/git-orchestration.js';
import { runAutomationTask } from '../core/automation/task-runner.js';

async function ensureRepositoryExists(workdir, org, repo) {
  try {
    const { repositoryPath } = await ensureRepository(workdir, org, repo);
    return { repositoryPath, cloned: false };
  } catch (error) {
    if (error && /Repository not found/i.test(error.message || '')) {
      const remote = `git@github.com:${org}/${repo}.git`;
      await cloneRepository(workdir, remote);
      const { repositoryPath } = await ensureRepository(workdir, org, repo);
      return { repositoryPath, cloned: true };
    }
    throw error;
  }
}

async function ensureWorktreeExists(workdir, org, repo, branch, options = {}) {
  try {
    const { worktreePath } = await getWorktreePath(workdir, org, repo, branch);
    return { worktreePath, created: false };
  } catch (error) {
    if (error && /worktree .* not found/i.test(error.message || '')) {
      await createWorktree(workdir, org, repo, branch, options);
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

function finishMetrics(key, success, durationMs) {
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

export function createAutomationHandlers(
  {
    workdir,
    agentCommands,
    apiKey,
    branchNameGenerator,
    planService,
    logger,
    defaultBranches,
  },
  {
    ensureRepositoryExists: ensureRepoExists = ensureRepositoryExists,
    ensureWorktreeExists: ensureWorktree = ensureWorktreeExists,
    launchAgentProcess: launchAgent = launchAgentProcess,
    discoverRepositories: discoverRepos = discoverRepositories,
    emitReposUpdate: emitRepos = emitReposUpdate,
    runTaskImpl = runTask,
    now = () => Date.now(),
    createRequestId = () => randomUUID(),
  } = {},
) {
  const gitOrchestrator = createGitOrchestrator({
    ensureRepositoryExists: ensureRepoExists,
    ensureWorktreeExists: ensureWorktree,
    discoverRepositories: discoverRepos,
    emitReposUpdate: emitRepos,
  });

  const logInfo = (...args) => {
    if (logger && typeof logger.info === 'function') {
      logger.info(...args);
    } else {
      console.info(...args);
    }
  };

  const logError = (...args) => {
    if (logger && typeof logger.error === 'function') {
      logger.error(...args);
    } else {
      console.error(...args);
    }
  };

  async function launch(context) {
    let validation;
    try {
      validation = await validateAutomationRequest({
        req: context.req,
        expectedApiKey: apiKey,
        readJsonBody: () => context.readJsonBody(),
        agentCommands,
      });
    } catch (error) {
      if (error instanceof AutomationRequestError) {
        sendJson(context.res, error.status, { error: error.message });
        return;
      }
      logError('[terminal-worktree] Automation validation failed unexpectedly.', error);
      sendJson(context.res, 500, { error: 'Unexpected error while validating automation request' });
      return;
    }

    const { planEnabled, routeLabel, prompt, org, repo, worktreeInput, agent } = validation;

    const metricsKey = planEnabled ? 'planTrue' : 'planFalse';
    automationPlanMetrics[metricsKey].requests += 1;

    const requestId = createRequestId();
    const startedAt = now();

    const elapsedMs = () => {
      const value = now() - startedAt;
      return Number.isFinite(value) ? value : 0;
    };

    const finishSuccess = (detail) => {
      const durationMs = elapsedMs();
      finishMetrics(metricsKey, true, durationMs);
      const suffix = detail ? `: ${detail}` : '';
      logInfo(
        `[terminal-worktree] Automation request ${requestId} (${routeLabel}) completed in ${durationMs}ms${suffix}`,
      );
    };

    const finishFailure = (message, error) => {
      const durationMs = elapsedMs();
      finishMetrics(metricsKey, false, durationMs);
      if (error) {
        logError(
          `[terminal-worktree] Automation request ${requestId} (${routeLabel}) failed after ${durationMs}ms: ${message}`,
          error,
        );
      } else {
        logError(
          `[terminal-worktree] Automation request ${requestId} (${routeLabel}) failed after ${durationMs}ms: ${message}`,
        );
      }
    };

    logInfo(`[terminal-worktree] Automation request ${requestId} (${routeLabel}) received.`);

    if (planEnabled && !prompt.trim()) {
      const message = 'prompt is required when plan is true';
      finishFailure(message);
      sendJson(context.res, 400, { error: message });
      return;
    }

    if (planEnabled && (!planService || !planService.isConfigured)) {
      const message =
        'Plan generation is not configured. Configure a local LLM command (set planLlm in config.json).';
      finishFailure(message);
      sendJson(context.res, 503, { error: message });
      return;
    }

    try {
      const { taskId, queuedData } = await runAutomationTask({
        runTaskImpl,
        resolveBranchName,
        generatePlanText,
        gitOrchestrator,
        launchAgent,
        workdir,
        planEnabled,
        routeLabel,
        prompt,
        org,
        repo,
        agent,
        requestId,
        worktreeInput,
        branchNameGenerator,
        defaultBranches,
        planService,
        finishSuccess,
        finishFailure,
        onBranchResolved: (branch) => {
          logInfo(
            `[terminal-worktree] Automation request ${requestId} (${routeLabel}) targeting ${org}/${repo}#${branch}.`,
          );
        },
      });

      sendJson(context.res, 202, { taskId, data: queuedData });
    } catch (error) {
      const status =
        error instanceof AutomationRequestError && typeof error.status === 'number'
          ? error.status
          : 500;
      const message = error instanceof Error ? error.message : String(error);
      finishFailure(message, error instanceof Error ? error : undefined);
      sendJson(context.res, status, { error: message });
    }
  }

  return { launch };
}
