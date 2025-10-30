import { randomUUID } from 'node:crypto';
import {
  cloneRepository,
  createWorktree,
  ensureRepository,
  getWorktreePath,
  normaliseBranchName,
} from '../core/git.js';
import { launchAgentProcess } from '../core/agents.js';
import { sendJson } from '../utils/http.js';

function extractApiKey(req) {
  const apiKeyHeader = req.headers?.['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  const authHeader = req.headers?.authorization;
  if (typeof authHeader === 'string') {
    const trimmed = authHeader.trim();
    if (/^bearer\s+/i.test(trimmed)) {
      return trimmed.replace(/^bearer\s+/i, '').trim();
    }
  }

  return '';
}

function parseRepoIdentifier(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new Error('repo must be provided in the format "org/repository"');
  }

  const cleaned = input.trim().replace(/\.git$/i, '');
  const segments = cleaned.split('/').filter(Boolean);
  if (segments.length !== 2) {
    throw new Error('repo must be provided in the format "org/repository"');
  }

  return { org: segments[0], repo: segments[1] };
}

function sanitiseBranch(worktreeDescriptor) {
  if (typeof worktreeDescriptor !== 'string' || !worktreeDescriptor.trim()) {
    throw new Error('worktree must be provided as "type/title"');
  }

  const parts = worktreeDescriptor
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    throw new Error('worktree must include both type and title separated by "/"');
  }

  const slugify = (value) =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

  const segments = parts.map((part) => {
    const slug = slugify(part);
    if (!slug) {
      throw new Error('worktree name segments must include alphanumeric characters');
    }
    return slug;
  });
  const branchName = normaliseBranchName(segments.join('/'));

  if (!branchName) {
    throw new Error('Derived branch name is empty');
  }

  if (branchName.toLowerCase() === 'main') {
    throw new Error('worktree branch "main" is not allowed');
  }

  return branchName;
}

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

async function ensureWorktreeExists(workdir, org, repo, branch) {
  try {
    const { worktreePath } = await getWorktreePath(workdir, org, repo, branch);
    return { worktreePath, created: false };
  } catch (error) {
    if (error && /worktree .* not found/i.test(error.message || '')) {
      await createWorktree(workdir, org, repo, branch);
      const { worktreePath } = await getWorktreePath(workdir, org, repo, branch);
      return { worktreePath, created: true };
    }
    throw error;
  }
}

function resolveAgentCommand(agentCommands, requested) {
  const key = typeof requested === 'string' ? requested.trim().toLowerCase() : '';
  if (!key) {
    throw new Error('command must be one of: codex, cursor, claude');
  }

  const mapping = {
    codex: agentCommands?.codexDangerous || agentCommands?.codex,
    cursor: agentCommands?.cursor,
    claude: agentCommands?.claudeDangerous || agentCommands?.claude,
  };

  const command = mapping[key];
  if (!command) {
    throw new Error(`Unsupported command "${requested}". Expected codex, cursor, or claude.`);
  }

  return { key, command };
}

function parsePlanFlag(value) {
  if (value === undefined) {
    return true;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  throw new Error('plan must be a boolean');
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
  },
  {
    ensureRepositoryExists: ensureRepoExists = ensureRepositoryExists,
    ensureWorktreeExists: ensureWorktree = ensureWorktreeExists,
    launchAgentProcess: launchAgent = launchAgentProcess,
    now = () => Date.now(),
    createRequestId = () => randomUUID(),
  } = {},
) {
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
    if (!apiKey) {
      sendJson(context.res, 503, { error: 'Automation API is not configured (missing API key)' });
      return;
    }

    const providedKey = extractApiKey(context.req);
    if (providedKey !== apiKey) {
      sendJson(context.res, 401, { error: 'Invalid API key' });
      return;
    }

    let payload;
    try {
      payload = await context.readJsonBody();
    } catch (error) {
      sendJson(context.res, 400, { error: error.message });
      return;
    }

    let planEnabled;
    try {
      planEnabled = parsePlanFlag(payload.plan);
    } catch (error) {
      sendJson(context.res, 400, { error: error.message });
      return;
    }

    const metricsKey = planEnabled ? 'planTrue' : 'planFalse';
    const routeLabel = planEnabled ? 'create-plan' : 'passthrough';
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

    const fail = (status, message, error) => {
      finishFailure(message, error);
      sendJson(context.res, status, { error: message });
    };

    logInfo(`[terminal-worktree] Automation request ${requestId} (${routeLabel}) received.`);

    let userPrompt = '';
    if (payload.prompt !== undefined) {
      if (typeof payload.prompt !== 'string') {
        fail(400, 'prompt must be a string');
        return;
      }
      userPrompt = payload.prompt;
    }

    let org;
    let repo;
    try {
      ({ org, repo } = parseRepoIdentifier(payload.repo));
    } catch (error) {
      fail(400, error.message, error);
      return;
    }

    const providedWorktree = typeof payload.worktree === 'string' ? payload.worktree.trim() : '';
    let branch = '';

    if (providedWorktree) {
      try {
        branch = sanitiseBranch(providedWorktree);
      } catch (error) {
        fail(400, error.message, error);
        return;
      }
    } else {
      if (!branchNameGenerator || !branchNameGenerator.isConfigured) {
        fail(
          503,
          'Branch name generation is not configured. Provide a worktree name or configure a local LLM command (set branchNameLlm in config.json).',
        );
        return;
      }
      try {
        branch = await branchNameGenerator.generateBranchName({
          prompt: userPrompt,
          org,
          repo,
        });
      } catch (error) {
        fail(500, error.message, error);
        return;
      }
    }

    if (!branch) {
      fail(500, 'Failed to determine branch name.');
      return;
    }

    if (planEnabled && !userPrompt.trim()) {
      fail(400, 'prompt is required when plan is true');
      return;
    }

    let repositoryPath = '';
    let clonedRepository = false;
    try {
      ({ repositoryPath, cloned: clonedRepository } = await ensureRepoExists(workdir, org, repo));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(500, message, error);
      return;
    }

    let effectivePrompt = userPrompt;
    if (planEnabled) {
      if (!planService || !planService.isConfigured) {
        fail(
          503,
          'Plan generation is not configured. Configure a local LLM command (set planLlm in config.json).',
        );
        return;
      }
      try {
        effectivePrompt = await planService.createPlanText({
          prompt: userPrompt,
          cwd: repositoryPath,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === 'prompt is required') {
          fail(400, message, error);
        } else {
          fail(502, message, error);
        }
        return;
      }
    }

    let agent;
    try {
      agent = resolveAgentCommand(agentCommands, payload.command);
    } catch (error) {
      fail(400, error.message, error);
      return;
    }

    logInfo(
      `[terminal-worktree] Automation request ${requestId} (${routeLabel}) targeting ${org}/${repo}#${branch}.`,
    );

    try {
      const { worktreePath, created } = await ensureWorktree(workdir, org, repo, branch);

      const {
        pid,
        sessionId,
        tmuxSessionName,
        usingTmux,
        createdSession,
      } = await launchAgent({
        command: agent.command,
        workdir,
        org,
        repo,
        branch,
        prompt: effectivePrompt,
      });

      finishSuccess(`${org}/${repo}#${branch}`);

      sendJson(context.res, 202, {
        data: {
          org,
          repo,
          branch,
          repositoryPath,
          worktreePath,
          clonedRepository,
          createdWorktree: created,
          agent: agent.key,
          agentCommand: agent.command,
          pid,
          terminalSessionId: sessionId,
          terminalSessionCreated: createdSession,
          tmuxSessionName,
          terminalUsingTmux: usingTmux,
          plan: planEnabled,
          promptRoute: routeLabel,
          automationRequestId: requestId,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finishFailure(message, error);
      sendJson(context.res, 500, { error: message });
    }
  }

  return { launch };
}
