import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as delayImmediate } from 'node:timers/promises';

import {
  createAutomationHandlers,
  automationPlanMetrics,
  resetAutomationPlanMetrics,
} from '../automation.js';

const agentCommands = {
  codex: 'codex-command',
  cursor: 'cursor-command',
  claude: 'claude-command',
};

const branchNameGenerator = {
  isConfigured: true,
  async generateBranchName() {
    return 'feature/generated';
  },
};

const logger = {
  info() {},
  error() {},
};

let lastPrompt = null;

beforeEach(() => {
  resetAutomationPlanMetrics();
  lastPrompt = null;
});

async function waitForAutomationTask(predicate, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (typeof predicate !== 'function' || predicate()) {
      return;
    }
    await delayImmediate();
  }
  throw new Error('Timed out waiting for automation task');
}

function createOverrides() {
  return {
    ensureRepositoryExists: async () => ({
      repositoryPath: '/work/org/repo/repository',
      cloned: false,
    }),
    ensureWorktreeExists: async () => ({
      worktreePath: '/work/org/repo/feature/generated',
      created: false,
    }),
    launchAgentProcess: async ({ prompt }) => {
      lastPrompt = prompt;
      return {
        pid: 4242,
        sessionId: 'session-123',
        tmuxSessionName: null,
        usingTmux: false,
        createdSession: true,
      };
    },
    now: (() => {
      const value = 1_700_000_000_000;
      return () => value;
    })(),
    createRequestId: () => 'req-automation-test',
  };
}

function createContext({ body, headers = {} }) {
  const res = {
    statusCode: 0,
    headers: {},
    ended: false,
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(payload) {
      this.body = payload;
      this.ended = true;
    },
  };

  return {
    req: {
      method: 'POST',
      headers,
    },
    res,
    readJsonBody: async () => body,
  };
}

test('defaults plan=true and routes prompt through plan service', async () => {
  const planCalls = [];
  const planService = {
    isConfigured: true,
    async createPlanText(options) {
      planCalls.push(options);
      return `PLAN:${options.prompt}`;
    },
  };

  const handlers = createAutomationHandlers(
    {
      workdir: '/work',
      agentCommands,
      apiKey: 'secret',
      branchNameGenerator,
      planService,
      logger,
    },
    createOverrides(),
  );

  const context = createContext({
    body: {
      repo: 'org/repo',
      worktree: 'feature/planned',
      command: 'codex',
      prompt: 'Ship the feature',
    },
    headers: { 'x-api-key': 'secret' },
  });

  await handlers.launch(context);
  await waitForAutomationTask(() => lastPrompt === 'PLAN:Ship the feature');

  assert.equal(context.res.statusCode, 202);
  assert.equal(context.res.ended, true);

  const payload = JSON.parse(context.res.body);
  assert.equal(payload.data.plan, true);
  assert.equal(payload.data.promptRoute, 'create-plan');
  assert.equal(payload.data.automationRequestId, 'req-automation-test');
  assert.equal(planCalls.length, 1);
  assert.deepEqual(planCalls[0], {
    prompt: 'Ship the feature',
    cwd: '/work/org/repo/repository',
  });
  assert.equal(lastPrompt, 'PLAN:Ship the feature');
  assert.equal(automationPlanMetrics.planTrue.requests, 1);
  assert.equal(automationPlanMetrics.planTrue.successes, 1);
  assert.equal(automationPlanMetrics.planTrue.failures, 0);
});

test('respects plan=false and bypasses plan service', async () => {
  let planInvoked = false;
  const planService = {
    isConfigured: true,
    async createPlanText() {
      planInvoked = true;
      return 'should not run';
    },
  };

  const overrides = createOverrides();

  const handlers = createAutomationHandlers(
    {
      workdir: '/work',
      agentCommands,
      apiKey: 'secret',
      branchNameGenerator,
      planService,
      logger,
    },
    overrides,
  );

  const context = createContext({
    body: {
      repo: 'org/repo',
      worktree: 'feature/direct',
      command: 'codex',
      prompt: 'Just run it',
      plan: false,
    },
    headers: { 'x-api-key': 'secret' },
  });

  await handlers.launch(context);
  await waitForAutomationTask(() => lastPrompt === 'Just run it');

  assert.equal(context.res.statusCode, 202);
  const payload = JSON.parse(context.res.body);
  assert.equal(payload.data.plan, false);
  assert.equal(payload.data.promptRoute, 'passthrough');
  assert.equal(lastPrompt, 'Just run it');
  assert.equal(planInvoked, false);
  assert.equal(automationPlanMetrics.planFalse.requests, 1);
  assert.equal(automationPlanMetrics.planFalse.successes, 1);
  assert.equal(automationPlanMetrics.planFalse.failures, 0);
});

test('rejects non-boolean plan values', async () => {
  const planService = {
    isConfigured: true,
    async createPlanText() {
      throw new Error('should not be called');
    },
  };

  const handlers = createAutomationHandlers(
    {
      workdir: '/work',
      agentCommands,
      apiKey: 'secret',
      branchNameGenerator,
      planService,
      logger,
    },
    createOverrides(),
  );

  const context = createContext({
    body: {
      repo: 'org/repo',
      worktree: 'feature/direct',
      command: 'codex',
      prompt: 'Explain plan type',
      plan: 'nope',
    },
    headers: { 'x-api-key': 'secret' },
  });

  await handlers.launch(context);

  assert.equal(context.res.statusCode, 400);
  const payload = JSON.parse(context.res.body);
  assert.equal(payload.error, 'plan must be a boolean');
  assert.equal(automationPlanMetrics.planTrue.requests, 0);
  assert.equal(automationPlanMetrics.planFalse.requests, 0);
  assert.equal(lastPrompt, null);
});

test('requires a prompt when plan is true', async () => {
  let planInvoked = false;
  const planService = {
    isConfigured: true,
    async createPlanText() {
      planInvoked = true;
      return 'unused';
    },
  };

  const handlers = createAutomationHandlers(
    {
      workdir: '/work',
      agentCommands,
      apiKey: 'secret',
      branchNameGenerator,
      planService,
      logger,
    },
    createOverrides(),
  );

  const context = createContext({
    body: {
      repo: 'org/repo',
      worktree: 'feature/missing',
      command: 'codex',
    },
    headers: { 'x-api-key': 'secret' },
  });

  await handlers.launch(context);

  assert.equal(context.res.statusCode, 400);
  const payload = JSON.parse(context.res.body);
  assert.equal(payload.error, 'prompt is required when plan is true');
  assert.equal(planInvoked, false);
  assert.equal(automationPlanMetrics.planTrue.requests, 1);
  assert.equal(automationPlanMetrics.planTrue.successes, 0);
  assert.equal(automationPlanMetrics.planTrue.failures, 1);
});
