import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
  automationPlanMetrics,
  createAutomationHandlers,
  ensureRepositoryExists,
  ensureWorktreeExists,
  resetAutomationPlanMetrics,
  __setAutomationTestOverrides,
} from './automation.js';
import { AutomationRequestError } from '../core/automation/request-validation.js';
import { ERROR_MESSAGES, HTTP_STATUS } from '../config/constants.js';
import type { RateLimiter } from '../core/security/rate-limiter.js';
import type { Logger } from '../infrastructure/logging/index.js';

function createResponse() {
  let body = '';
  const headers = new Map<string, unknown>();
  const res = {
    statusCode: 0,
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    end(chunk?: string) {
      if (chunk) {
        body += chunk;
      }
    },
  } as unknown as import('node:http').ServerResponse;

  return {
    res,
    getJson(): unknown {
      return body ? JSON.parse(body) : undefined;
    },
  };
}

describe('ensureRepositoryExists', () => {
  it('uses existing repository when available', async () => {
    const ensure = mock.fn(async () => ({ repositoryPath: '/workdir/org/repo/repository' }));
    __setAutomationTestOverrides({ ensureRepository: ensure });

    try {
      const result = await ensureRepositoryExists('/workdir', 'org', 'repo');
      assert.deepEqual(result, {
        repositoryPath: '/workdir/org/repo/repository',
        cloned: false,
      });
      assert.equal(ensure.mock.calls.length, 1);
    } finally {
      __setAutomationTestOverrides();
    }
  });

  it('clones repository when missing', async () => {
    const clone = mock.fn(async () => undefined);
    let attempts = 0;
    const ensure = mock.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('Repository not found for org/repo');
      }
      return { repositoryPath: '/repos/org/repo/repository' };
    });
    __setAutomationTestOverrides({ cloneRepository: clone, ensureRepository: ensure });

    try {
      const result = await ensureRepositoryExists('/repos', 'org', 'repo');
      assert.deepEqual(result, {
        repositoryPath: '/repos/org/repo/repository',
        cloned: true,
      });
      assert.equal(clone.mock.calls.length, 1);
      const cloneArgs = clone.mock.calls[0]?.arguments ?? [];
      assert.deepEqual(cloneArgs, ['/repos', 'git@github.com:org/repo.git']);
      assert.equal(ensure.mock.calls.length, 2);
    } finally {
      __setAutomationTestOverrides();
    }
  });

  it('rethrows unexpected repository errors', async () => {
    const ensure = mock.fn(async () => {
      throw new Error('Permission denied');
    });
    __setAutomationTestOverrides({ ensureRepository: ensure });

    try {
      await assert.rejects(() => ensureRepositoryExists('/workdir', 'org', 'repo'), /Permission denied/);
      assert.equal(ensure.mock.calls.length, 1);
    } finally {
      __setAutomationTestOverrides();
    }
  });
});

describe('ensureWorktreeExists', () => {
  it('returns existing worktree path', async () => {
    const getWorktreePath = mock.fn(async () => ({ worktreePath: '/worktrees/branch' }));
    __setAutomationTestOverrides({ getWorktreePath });

    try {
      const result = await ensureWorktreeExists('/workdir', 'org', 'repo', 'branch');
      assert.deepEqual(result, { worktreePath: '/worktrees/branch', created: false });
      assert.equal(getWorktreePath.mock.calls.length, 1);
    } finally {
      __setAutomationTestOverrides();
    }
  });

  it('creates missing worktree and retries path lookup', async () => {
    const createWorktree = mock.fn(async () => undefined);
    let attempts = 0;
    const getWorktreePath = mock.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('Worktree foo not found');
      }
      return { worktreePath: '/workdir/org/repo/foo' };
    });
    __setAutomationTestOverrides({ createWorktree, getWorktreePath });

    try {
      const result = await ensureWorktreeExists('/workdir', 'org', 'repo', 'foo');
      assert.deepEqual(result, { worktreePath: '/workdir/org/repo/foo', created: true });
      assert.equal(createWorktree.mock.calls.length, 1);
      assert.equal(getWorktreePath.mock.calls.length, 2);
    } finally {
      __setAutomationTestOverrides();
    }
  });

  it('rethrows unexpected worktree errors', async () => {
    const getWorktreePath = mock.fn(async () => {
      throw new Error('Filesystem unavailable');
    });
    __setAutomationTestOverrides({ getWorktreePath });

    try {
      await assert.rejects(() => ensureWorktreeExists('/workdir', 'org', 'repo', 'foo'), /Filesystem unavailable/);
    } finally {
      __setAutomationTestOverrides();
    }
  });
});

describe('resetAutomationPlanMetrics', () => {
  it('clears collected metric totals', () => {
    automationPlanMetrics.planTrue.requests = 4;
    automationPlanMetrics.planTrue.successes = 1;
    automationPlanMetrics.planTrue.failures = 3;
    automationPlanMetrics.planTrue.totalLatencyMs = 900;
    automationPlanMetrics.planFalse.requests = 2;
    automationPlanMetrics.planFalse.successes = 2;
    automationPlanMetrics.planFalse.failures = 0;
    automationPlanMetrics.planFalse.totalLatencyMs = 120;

    resetAutomationPlanMetrics();

    for (const bucket of Object.values(automationPlanMetrics)) {
      assert.equal(bucket.requests, 0);
      assert.equal(bucket.successes, 0);
      assert.equal(bucket.failures, 0);
      assert.equal(bucket.totalLatencyMs, 0);
    }
  });
});

describe('createAutomationHandlers', () => {
  it('responds with validation error details', async () => {
    const validate = mock.fn(async () => {
      throw new AutomationRequestError(422, 'Invalid payload');
    });
    const logger = { info: mock.fn(), error: mock.fn() };
    __setAutomationTestOverrides({ validateAutomationRequest: validate, createLogger: () => logger as never });

    resetAutomationPlanMetrics();

    const handlers = createAutomationHandlers(
      {
        workdir: '/workdir',
        agentCommands: {},
        branchNameGenerator: {},
        planService: { isConfigured: true },
        defaultBranches: {},
      },
    );

    const { res, getJson } = createResponse();
    await handlers.launch({
      req: { headers: {} },
      res,
      readJsonBody: async () => ({}) as unknown,
    });

    assert.equal(res.statusCode, 422);
    assert.deepEqual(getJson(), { error: 'Invalid payload' });
    assert.equal(validate.mock.calls.length, 1);
    assert.equal(logger.info.mock.calls.length, 0);
    assert.equal(logger.error.mock.calls.length, 0);
    __setAutomationTestOverrides();
  });

  it('handles unexpected validation errors', async () => {
    const validate = mock.fn(async () => {
      throw new Error('boom');
    });
    const logger = { info: mock.fn(), error: mock.fn() };
    __setAutomationTestOverrides({ validateAutomationRequest: validate, createLogger: () => logger as never });

    const handlers = createAutomationHandlers(
      {
        workdir: '/workdir',
        agentCommands: {},
        branchNameGenerator: {},
        planService: { isConfigured: true },
        defaultBranches: {},
      },
    );

    const { res, getJson } = createResponse();
    await handlers.launch({ req: { headers: {} }, res, readJsonBody: async () => ({}) });
    assert.equal(res.statusCode, 500);
    assert.deepEqual(getJson(), { error: 'Unexpected error while validating automation request' });
    assert.equal(logger.error.mock.calls.length, 1);
    __setAutomationTestOverrides();
  });

  it('returns 429 when rate limiter blocks before validation', async () => {
    const validate = mock.fn(async () => ({}));
    __setAutomationTestOverrides({ validateAutomationRequest: validate });
    const rateLimiter: RateLimiter = {
      check: mock.fn(() => ({ limited: true, retryAfterMs: 2000, attempts: 5 })),
      recordFailure: mock.fn(() => ({ limited: true, retryAfterMs: 0, attempts: 0 })),
      reset: mock.fn(() => {}),
    };
    const logger: Logger = { info: mock.fn(), error: mock.fn(), warn: mock.fn(), debug: mock.fn() };

    const handlers = createAutomationHandlers(
      {
        workdir: '/workdir',
        agentCommands: {},
        branchNameGenerator: {},
        planService: { isConfigured: true },
        defaultBranches: {},
        logger,
      },
      { rateLimiter },
    );

    const { res, getJson } = createResponse();
    await handlers.launch({ req: { headers: { 'x-forwarded-for': '10.0.0.1' } }, res, readJsonBody: async () => ({}) });

    assert.equal(res.statusCode, HTTP_STATUS.TOO_MANY_REQUESTS);
    assert.deepEqual(getJson(), { error: ERROR_MESSAGES.TOO_MANY_AUTOMATION_ATTEMPTS });
    assert.equal(validate.mock.calls.length, 0);
    assert.equal(logger.warn.mock.calls.length, 1);
    __setAutomationTestOverrides();
  });

  it('escalates invalid API key failures to 429 when limiter trips', async () => {
    const validate = mock.fn(async () => {
      throw new AutomationRequestError(401, 'Invalid API key');
    });
    __setAutomationTestOverrides({ validateAutomationRequest: validate });
    const rateLimiter: RateLimiter = {
      check: mock.fn(() => ({ limited: false, retryAfterMs: 0, attempts: 0 })),
      recordFailure: mock.fn(() => ({ limited: true, retryAfterMs: 4000, attempts: 5 })),
      reset: mock.fn(() => {}),
    };
    const logger: Logger = { info: mock.fn(), error: mock.fn(), warn: mock.fn(), debug: mock.fn() };

    const handlers = createAutomationHandlers(
      {
        workdir: '/workdir',
        agentCommands: {},
        branchNameGenerator: {},
        planService: { isConfigured: true },
        defaultBranches: {},
        logger,
      },
      { rateLimiter },
    );

    const { res, getJson } = createResponse();
    await handlers.launch({ req: { headers: {} }, res, readJsonBody: async () => ({}) });

    assert.equal(rateLimiter.recordFailure.mock.calls.length, 1);
    assert.equal(res.statusCode, HTTP_STATUS.TOO_MANY_REQUESTS);
    assert.deepEqual(getJson(), { error: ERROR_MESSAGES.TOO_MANY_AUTOMATION_ATTEMPTS });
    assert.equal(logger.warn.mock.calls.length, 1);
    __setAutomationTestOverrides();
  });

  it('resets the rate limiter after successful validation', async () => {
    const validate = mock.fn(async () => ({
      planEnabled: false,
      prompt: '',
      org: 'org',
      repo: 'repo',
      worktreeInput: 'feature/test',
      agent: { key: 'codex', command: 'codex' },
      routeLabel: 'route',
    }));
    const runAutomationTask = mock.fn(async () => ({ taskId: 'task-1', queuedData: {} }));
    __setAutomationTestOverrides({ validateAutomationRequest: validate, runAutomationTask });
    const rateLimiter: RateLimiter = {
      check: mock.fn(() => ({ limited: false, retryAfterMs: 0, attempts: 0 })),
      recordFailure: mock.fn(() => ({ limited: false, retryAfterMs: 0, attempts: 0 })),
      reset: mock.fn(() => {}),
    };

    const handlers = createAutomationHandlers(
      {
        workdir: '/workdir',
        agentCommands: {},
        branchNameGenerator: {},
        planService: { isConfigured: true },
        defaultBranches: {},
      },
      { rateLimiter },
    );

    const { res } = createResponse();
    await handlers.launch({ req: { headers: {} }, res, readJsonBody: async () => ({}) });

    assert.equal(rateLimiter.reset.mock.calls.length, 1);
    __setAutomationTestOverrides();
  });

  it('rejects plan-enabled requests without prompt text', async () => {
    const validate = mock.fn(async () => ({
      planEnabled: true,
      prompt: '   ',
      org: 'org',
      repo: 'repo',
      worktreeInput: 'feature/test',
      agent: { key: 'codex', command: 'codex' },
      routeLabel: 'test-route',
    }));
    const logger = { info: mock.fn(), error: mock.fn() };
    __setAutomationTestOverrides({ validateAutomationRequest: validate, createLogger: () => logger as never });
    resetAutomationPlanMetrics();

    const handlers = createAutomationHandlers(
      {
        workdir: '/workdir',
        agentCommands: {},
        branchNameGenerator: {},
        planService: { isConfigured: true },
        defaultBranches: {},
      },
    );

    const { res, getJson } = createResponse();
    await handlers.launch({ req: { headers: {} }, res, readJsonBody: async () => ({}) });

    assert.equal(res.statusCode, 400);
    assert.deepEqual(getJson(), { error: 'prompt is required when plan is true' });
    assert.equal(automationPlanMetrics.planTrue.requests, 1);
    assert.equal(automationPlanMetrics.planTrue.failures, 1);
    assert.equal(logger.error.mock.calls.length, 1);
    __setAutomationTestOverrides();
  });

  it('rejects plan requests when plan service is not configured', async () => {
    const validate = mock.fn(async () => ({
      planEnabled: true,
      prompt: 'hello world',
      org: 'org',
      repo: 'repo',
      worktreeInput: 'feature/test',
      agent: { key: 'codex', command: 'codex' },
      routeLabel: 'route',
    }));
    const logger = { info: mock.fn(), error: mock.fn() };
    __setAutomationTestOverrides({ validateAutomationRequest: validate, createLogger: () => logger as never });
    resetAutomationPlanMetrics();

    const handlers = createAutomationHandlers(
      {
        workdir: '/workdir',
        agentCommands: {},
        branchNameGenerator: {},
        planService: { isConfigured: false },
        defaultBranches: {},
      },
    );

    const { res, getJson } = createResponse();
    await handlers.launch({ req: { headers: {} }, res, readJsonBody: async () => ({}) });

    assert.equal(res.statusCode, 503);
    assert.match(String(getJson()?.['error']), /Plan generation is not configured/);
    assert.equal(automationPlanMetrics.planTrue.requests, 1);
    assert.equal(automationPlanMetrics.planTrue.failures, 1);
    __setAutomationTestOverrides();
  });

  it('enqueues automation tasks and records success metrics', async () => {
    const validate = mock.fn(async () => ({
      planEnabled: false,
      prompt: '',
      org: 'org',
      repo: 'repo',
      worktreeInput: 'feature/test',
      agent: { key: 'codex', command: 'codex' },
      routeLabel: 'route',
    }));
    const runAutomationTask = mock.fn(async (options: Record<string, unknown>) => {
      const finishSuccess = options['finishSuccess'] as ((detail?: string) => void) | undefined;
      finishSuccess?.('queued');
      return { taskId: 'task-1', queuedData: { branch: 'feature/test' } };
    });
    const logger = { info: mock.fn(), error: mock.fn() };
    const createGitOrchestrator = mock.fn(() => ({ orchestrated: true }));
    __setAutomationTestOverrides({
      validateAutomationRequest: validate,
      runAutomationTask,
      createLogger: () => logger as never,
      createGitOrchestrator: createGitOrchestrator as never,
    });

    resetAutomationPlanMetrics();

    const ensureRepo = mock.fn(async () => ({ repositoryPath: '/repo', cloned: false }));
    const ensureWorktree = mock.fn(async () => ({ worktreePath: '/repo/worktree', created: false }));
    const times = [1000, 1300];

    const handlers = createAutomationHandlers(
      {
        workdir: '/workdir',
        agentCommands: {},
        branchNameGenerator: {},
        planService: { isConfigured: true },
        defaultBranches: {},
      },
      {
        ensureRepositoryExists: ensureRepo,
        ensureWorktreeExists: ensureWorktree,
        runTaskImpl: mock.fn(async () => ({ id: 'task' })),
        now: () => (times.shift() ?? 1300),
        createRequestId: () => 'req-1',
      },
    );

    const { res, getJson } = createResponse();
    await handlers.launch({ req: { headers: {} }, res, readJsonBody: async () => ({}) });

    assert.equal(res.statusCode, 202);
    assert.deepEqual(getJson(), { taskId: 'task-1', data: { branch: 'feature/test' } });
    assert.equal(automationPlanMetrics.planFalse.requests, 1);
    assert.equal(automationPlanMetrics.planFalse.successes, 1);
    assert.equal(runAutomationTask.mock.calls.length, 1);
    assert.equal(logger.info.mock.calls.length >= 1, true);
    assert.equal(logger.error.mock.calls.length, 0);
    __setAutomationTestOverrides();
  });

  it('handles task failures and records failure metrics', async () => {
    const validate = mock.fn(async () => ({
      planEnabled: false,
      prompt: '',
      org: 'org',
      repo: 'repo',
      worktreeInput: 'feature/test',
      agent: { key: 'codex', command: 'codex' },
      routeLabel: 'route',
    }));
    const runAutomationTask = mock.fn(async () => {
      throw new AutomationRequestError(410, 'Task failed');
    });
    const logger = { info: mock.fn(), error: mock.fn() };
    __setAutomationTestOverrides({
      validateAutomationRequest: validate,
      runAutomationTask,
      createLogger: () => logger as never,
    });

    resetAutomationPlanMetrics();

    const handlers = createAutomationHandlers(
      {
        workdir: '/workdir',
        agentCommands: {},
        branchNameGenerator: {},
        planService: { isConfigured: true },
        defaultBranches: {},
      },
    );

    const { res, getJson } = createResponse();
    await handlers.launch({ req: { headers: {} }, res, readJsonBody: async () => ({}) });

    assert.equal(res.statusCode, 410);
    assert.deepEqual(getJson(), { error: 'Task failed' });
    assert.equal(automationPlanMetrics.planFalse.failures, 1);
    assert.equal(logger.error.mock.calls.length, 1);
    __setAutomationTestOverrides();
  });
});
