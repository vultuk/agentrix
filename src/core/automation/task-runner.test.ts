import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { runAutomationTask, STEP_IDS, TASK_TYPE_AUTOMATION } from './task-runner.js';

function createProgressHarness() {
  const calls: Array<{ action: string; id: string; payload?: unknown }> = [];

  const progress = {
    ensureStep: mock.fn((id: string, label: string) => {
      calls.push({ action: 'ensure', id, payload: label });
    }),
    startStep: mock.fn((id: string, payload: unknown) => {
      calls.push({ action: 'start', id, payload });
    }),
    completeStep: mock.fn((id: string, payload: unknown) => {
      calls.push({ action: 'complete', id, payload });
    }),
    failStep: mock.fn((id: string, payload: unknown) => {
      calls.push({ action: 'fail', id, payload });
    }),
    skipStep: mock.fn((id: string, payload: unknown) => {
      calls.push({ action: 'skip', id, payload });
    }),
  };

  return { progress, calls };
}

describe('runAutomationTask', () => {
  beforeEach(() => {
    mock.restoreAll();
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it('runs automation workflow and records success when plan generation is disabled', async () => {
    const { progress, calls } = createProgressHarness();
    const metadataUpdates: unknown[] = [];
    let setResultPayload: unknown = null;

    const runTaskImpl = mock.fn(async (config: unknown, executor: (context: unknown) => Promise<unknown>) => {
      const ctx = {
        progress,
        updateMetadata: (update: unknown) => {
          metadataUpdates.push(update);
        },
        setResult: (value: unknown) => {
          setResultPayload = value;
        },
      };

      assert.deepEqual(config, {
        type: TASK_TYPE_AUTOMATION,
        title: 'Automation launch for acme/demo',
        metadata: {
          automationRequestId: 'req-1',
          planEnabled: false,
          promptProvided: true,
          org: 'acme',
          repo: 'demo',
          branch: 'feature/main',
          command: 'codex',
          status: 'pending',
        },
      });

      const result = await executor(ctx);
      return { id: 'task-123', result };
    });

    const resolveBranchName = mock.fn(async () => ({
      branch: 'feature/main',
      source: 'prompt',
    }));

    const generatePlanText = mock.fn(async () => {
      throw new Error('should not be called when plan disabled');
    });

    const ensureRepositoryReady = mock.fn(async (workdir: string, org: string, repo: string) => {
      assert.equal(workdir, '/work');
      assert.equal(org, 'acme');
      assert.equal(repo, 'demo');
      return { repositoryPath: '/work/acme/demo', cloned: false };
    });

    const ensureWorktreeReady = mock.fn(async () => ({
      worktreePath: '/work/acme/demo/worktrees/feature-main',
      created: false,
    }));

    const refreshRepositoryViews = mock.fn(async () => {});

    const gitOrchestrator = {
      ensureRepositoryReady,
      ensureWorktreeReady,
      refreshRepositoryViews,
    };

    const launchAgent = mock.fn(async (options: Record<string, unknown>) => {
      assert.equal(options.prompt, 'Ship feature quickly');
      return {
        pid: 4321,
        sessionId: 'session-xyz',
        tmuxSessionName: 'tmux-xyz',
        usingTmux: true,
        createdSession: false,
      };
    });

    const finishSuccess = mock.fn(() => {});
    const finishFailure = mock.fn(() => {});

    const result = await runAutomationTask({
      runTaskImpl,
      resolveBranchName,
      generatePlanText,
      gitOrchestrator,
      launchAgent,
      workdir: '/work',
      planEnabled: false,
      routeLabel: '/api/automation',
      prompt: 'Ship feature quickly',
      org: 'acme',
      repo: 'demo',
      agent: { key: 'codex', command: 'codex --run' },
      requestId: 'req-1',
      branchNameGenerator: null,
      defaultBranches: null,
      planService: null,
      worktreeInput: undefined,
      finishSuccess,
      finishFailure,
    });

    assert.deepEqual(result, {
      taskId: 'task-123',
      queuedData: {
        org: 'acme',
        repo: 'demo',
        branch: 'feature/main',
        repositoryPath: null,
        worktreePath: null,
        clonedRepository: null,
        createdWorktree: null,
        agent: 'codex',
        agentCommand: 'codex --run',
        pid: null,
        terminalSessionId: null,
        terminalSessionCreated: false,
        tmuxSessionName: null,
        terminalUsingTmux: false,
        plan: false,
        promptRoute: '/api/automation',
        automationRequestId: 'req-1',
      },
      branch: 'feature/main',
    });

    assert.equal(runTaskImpl.mock.callCount(), 1);
    assert.equal(resolveBranchName.mock.callCount(), 1);
    assert.equal(generatePlanText.mock.callCount(), 0);
    assert.equal(ensureRepositoryReady.mock.callCount(), 1);
    assert.equal(ensureWorktreeReady.mock.callCount(), 1);
    assert.equal(refreshRepositoryViews.mock.callCount(), 1);
    assert.equal(launchAgent.mock.callCount(), 1);
    assert.equal(finishSuccess.mock.callCount(), 1);
    assert.equal(finishFailure.mock.callCount(), 0);

    assert.ok(metadataUpdates.some((update) => (update as Record<string, unknown>).status === 'succeeded'));
    assert.ok(metadataUpdates.some((update) => (update as Record<string, unknown>).repositoryPath === '/work/acme/demo'));

    assert.ok(setResultPayload);
    const resultData = setResultPayload as Record<string, unknown>;
    assert.equal(resultData.org, 'acme');
    assert.equal(resultData.repo, 'demo');
    assert.equal(resultData.branch, 'feature/main');
    assert.equal(resultData.plan, false);
    assert.equal(resultData.terminalSessionId, 'session-xyz');
    assert.equal(resultData.terminalSessionCreated, false);

    const skipGeneratePlan = calls.find((entry) => entry.action === 'skip' && entry.id === STEP_IDS.GENERATE_PLAN);
    assert.ok(skipGeneratePlan);
  });

  it('generates plan text and surfaces errors from the plan step', async () => {
    const { progress, calls } = createProgressHarness();
    const metadataUpdates: unknown[] = [];

    const runTaskImpl = mock.fn(async (_config: unknown, executor: (context: unknown) => Promise<unknown>) => {
      try {
        await executor({
          progress,
          updateMetadata: (update: unknown) => metadataUpdates.push(update),
          setResult: () => {},
        });
      } catch (error) {
        throw error;
      }
      return { id: 'task-456' };
    });

    const resolveBranchName = mock.fn(async () => ({ branch: 'feature/docs', source: 'prompt' }));

    const generatePlanText = mock.fn(async () => {
      throw new Error('LLM timeout');
    });

    const gitOrchestrator = {
      ensureRepositoryReady: mock.fn(async () => ({ repositoryPath: '/repo', cloned: true })),
      ensureWorktreeReady: mock.fn(async () => ({ worktreePath: '/repo/worktree', created: true })),
      refreshRepositoryViews: mock.fn(async () => {}),
    };

    const launchAgent = mock.fn(async () => ({
      pid: 0,
      sessionId: 's',
      tmuxSessionName: null,
      usingTmux: false,
      createdSession: true,
    }));

    const finishSuccess = mock.fn(() => {});
    const finishFailure = mock.fn(() => {});

    await assert.rejects(
      () =>
        runAutomationTask({
          runTaskImpl,
          resolveBranchName,
          generatePlanText,
          gitOrchestrator,
          launchAgent,
          workdir: '/work',
          planEnabled: true,
          routeLabel: '/automation',
          prompt: 'Draft docs',
          org: 'acme',
          repo: 'demo',
          agent: { key: 'scribe', command: 'scribe run' },
          requestId: 'req-plan',
          branchNameGenerator: null,
          defaultBranches: null,
          planService: { id: 'plan-service' },
          finishSuccess,
          finishFailure,
        }),
      /LLM timeout/,
    );

    assert.equal(generatePlanText.mock.callCount(), 1);
    assert.equal(finishSuccess.mock.callCount(), 0);
    assert.equal(finishFailure.mock.callCount(), 1);

    const failedStep = calls.find((entry) => entry.action === 'fail' && entry.id === STEP_IDS.GENERATE_PLAN);
    assert.ok(failedStep);

    assert.ok(metadataUpdates.some((update) => (update as Record<string, unknown>).status === 'failed'));
  });

  it('fails gracefully when repository refresh throws', async () => {
    const { progress } = createProgressHarness();
    const metadataUpdates: unknown[] = [];

    const runTaskImpl = mock.fn(async (_config: unknown, executor: (context: unknown) => Promise<unknown>) => {
      await executor({
        progress,
        updateMetadata: (update: unknown) => metadataUpdates.push(update),
        setResult: () => {},
      });
      return { id: 'task-789' };
    });

    const resolveBranchName = mock.fn(async () => ({
      branch: 'feature/api',
      source: 'prompt',
    }));

    const generatePlanText = mock.fn(async () => ({
      promptToExecute: 'Execute refined prompt',
      planGenerated: true,
    }));

    const refreshError = new Error('git fetch failed');

    const gitOrchestrator = {
      ensureRepositoryReady: mock.fn(async () => ({ repositoryPath: '/repo', cloned: false })),
      ensureWorktreeReady: mock.fn(async () => ({ worktreePath: '/repo/worktree', created: true })),
      refreshRepositoryViews: mock.fn(async () => {
        throw refreshError;
      }),
    };

    const launchAgent = mock.fn(async () => ({
      pid: 101,
      sessionId: 'session-api',
      tmuxSessionName: null,
      usingTmux: false,
      createdSession: true,
    }));

    const finishFailure = mock.fn(() => {});

    await assert.rejects(
      () =>
        runAutomationTask({
          runTaskImpl,
          resolveBranchName,
          generatePlanText,
          gitOrchestrator,
          launchAgent,
          workdir: '/work',
          planEnabled: true,
          routeLabel: '/automation',
          prompt: 'Build API',
          org: 'acme',
          repo: 'demo',
          agent: { key: 'coder', command: 'coder go' },
          requestId: 'req-refresh',
          branchNameGenerator: null,
          defaultBranches: null,
          planService: {},
          finishSuccess: () => {},
          finishFailure,
        }),
      /git fetch failed/,
    );

    assert.equal(finishFailure.mock.callCount(), 1);
    assert.ok(metadataUpdates.some((update) => (update as Record<string, unknown>).status === 'failed'));
  });
});


