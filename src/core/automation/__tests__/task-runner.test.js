import { describe, test, expect } from 'bun:test';
import { runAutomationTask, STEP_IDS } from '../task-runner.js';
import { AutomationRequestError } from '../request-validation.js';

function createProgressRecorder() {
  const events = [];
  return {
    events,
    controller: {
      ensureStep: (id, label) => events.push({ type: 'ensure', id, label }),
      startStep: (id, payload) => events.push({ type: 'start', id, payload }),
      completeStep: (id, payload) => events.push({ type: 'complete', id, payload }),
      skipStep: (id, payload) => events.push({ type: 'skip', id, payload }),
      failStep: (id, payload) => events.push({ type: 'fail', id, payload }),
    },
  };
}

describe('task-runner', () => {
  test('runs automation task with plan generation', async () => {
    const branchCalls = [];
    const planCalls = [];
    const repoCalls = [];
    const worktreeCalls = [];
    const refreshCalls = [];
    const agentCalls = [];
    const metadataUpdates = [];
    let resultSnapshot = null;
    const finishSuccessCalls = [];
    const finishFailureCalls = [];

    let taskPromise = null;
    const progressRecorder = createProgressRecorder();

    const runTaskImpl = (config, handler) => {
      expect(config.type).toBe('automation:launch');
      taskPromise = handler({
        progress: progressRecorder.controller,
        updateMetadata(updates) {
          metadataUpdates.push(updates);
        },
        setResult(result) {
          resultSnapshot = result;
        },
      });
      return { id: 'task-123' };
    };

    const resolveBranchName = async (params) => {
      branchCalls.push(params);
      return { branch: 'feature/generated', defaultBranchOverride: 'develop', source: 'generator' };
    };

    const generatePlanText = async (input) => {
      planCalls.push(input);
      return { promptToExecute: `${input.prompt} :: plan`, planGenerated: true };
    };

    const gitOrchestrator = {
      ensureRepositoryReady: async (args) => {
        repoCalls.push(args);
        return { repositoryPath: '/repos/acme/web', clonedRepository: false };
      },
      ensureWorktreeReady: async (args) => {
        worktreeCalls.push(args);
        return { worktreePath: '/repos/acme/web/feature', createdWorktree: true };
      },
      refreshRepositoryViews: async (args) => {
        refreshCalls.push(args);
      },
    };

    const launchAgent = async (args) => {
      agentCalls.push(args);
      return {
        pid: 123,
        sessionId: 'session-1',
        tmuxSessionName: 'tmux-1',
        usingTmux: true,
        createdSession: true,
      };
    };

    const { taskId, queuedData } = await runAutomationTask({
      runTaskImpl,
      resolveBranchName,
      generatePlanText,
      gitOrchestrator,
      launchAgent,
      workdir: '/workdir',
      planEnabled: true,
      routeLabel: 'create-plan',
      prompt: 'Improve DX',
      org: 'acme',
      repo: 'web',
      agent: { key: 'codex', command: 'codex-command' },
      requestId: 'req-1',
      worktreeInput: '',
      branchNameGenerator: { isConfigured: true },
      defaultBranches: { overrides: { 'acme/web': 'develop' } },
      planService: { isConfigured: true },
      finishSuccess: (detail) => finishSuccessCalls.push(detail),
      finishFailure: (message) => finishFailureCalls.push(message),
      onBranchResolved: () => {},
    });

    await taskPromise;

    expect(taskId).toBe('task-123');
    expect(queuedData).toMatchObject({
      org: 'acme',
      repo: 'web',
      branch: 'feature/generated',
      plan: true,
      promptRoute: 'create-plan',
    });

    expect(branchCalls).toHaveLength(1);
    expect(branchCalls[0]).toMatchObject({
      prompt: 'Improve DX',
      org: 'acme',
      repo: 'web',
    });

    expect(planCalls).toHaveLength(1);
    expect(planCalls[0]).toMatchObject({
      prompt: 'Improve DX',
      repositoryPath: '/repos/acme/web',
    });

    expect(repoCalls).toEqual([{ workdir: '/workdir', org: 'acme', repo: 'web' }]);
    expect(worktreeCalls).toEqual([
      {
        workdir: '/workdir',
        org: 'acme',
        repo: 'web',
        branch: 'feature/generated',
        defaultBranchOverride: 'develop',
      },
    ]);
    expect(refreshCalls).toEqual([{ workdir: '/workdir' }]);

    expect(agentCalls).toEqual([
      {
        command: 'codex-command',
        workdir: '/workdir',
        org: 'acme',
        repo: 'web',
        branch: 'feature/generated',
        prompt: 'Improve DX :: plan',
      },
    ]);

    expect(resultSnapshot).toMatchObject({
      org: 'acme',
      repo: 'web',
      branch: 'feature/generated',
      plan: true,
      agent: 'codex',
      automationRequestId: 'req-1',
      terminalSessionCreated: true,
    });

    expect(metadataUpdates[0]).toEqual({ status: 'running' });
    expect(metadataUpdates.at(-1)).toEqual({ status: 'succeeded' });

    expect(finishSuccessCalls).toEqual(['acme/web#feature/generated']);
    expect(finishFailureCalls).toHaveLength(0);

    const skipEvents = progressRecorder.events.filter((event) => event.type === 'skip');
    expect(skipEvents).toHaveLength(0);
  });

  test('skips plan step when plan is disabled', async () => {
    const progressRecorder = createProgressRecorder();
    let taskPromise = null;
    const runTaskImpl = (_config, handler) => {
      taskPromise = handler({
        progress: progressRecorder.controller,
        updateMetadata() {},
        setResult() {},
      });
      return { id: 'task-2' };
    };

    const resolveBranchName = async () => ({
      branch: 'feature/from-worktree',
      defaultBranchOverride: undefined,
      source: 'worktree',
    });

    const gitOrchestrator = {
      ensureRepositoryReady: async () => ({
        repositoryPath: '/repo',
        clonedRepository: false,
      }),
      ensureWorktreeReady: async () => ({
        worktreePath: '/repo/feature',
        createdWorktree: false,
      }),
      refreshRepositoryViews: async () => {},
    };

    const launchAgent = async () => ({
      pid: 456,
      sessionId: 'session-2',
      tmuxSessionName: null,
      usingTmux: false,
      createdSession: false,
    });

    const generatePlanText = () => {
      throw new Error('should not be called');
    };

    const { queuedData } = await runAutomationTask({
      runTaskImpl,
      resolveBranchName,
      generatePlanText,
      gitOrchestrator,
      launchAgent,
      workdir: '/workdir',
      planEnabled: false,
      routeLabel: 'passthrough',
      prompt: '',
      org: 'acme',
      repo: 'web',
      agent: { key: 'cursor', command: 'cursor-command' },
      requestId: 'req-2',
      worktreeInput: 'feature/from-worktree',
      branchNameGenerator: null,
      defaultBranches: null,
      planService: null,
      finishSuccess: () => {},
      finishFailure: () => {},
      onBranchResolved: () => {},
    });

    await taskPromise;

    expect(queuedData.plan).toBe(false);
    const skipEvents = progressRecorder.events.filter(
      (event) => event.type === 'skip' && event.id === STEP_IDS.GENERATE_PLAN,
    );
    expect(skipEvents).toHaveLength(1);
  });

  test('propagates resolveBranchName errors', async () => {
    const runTaskImpl = () => {
      throw new Error('should not get here');
    };

    const resolveBranchName = async () => {
      throw new AutomationRequestError(400, 'Invalid worktree');
    };

    await expect(
      runAutomationTask({
        runTaskImpl,
        resolveBranchName,
        generatePlanText: async () => ({ promptToExecute: '', planGenerated: false }),
        gitOrchestrator: {
          ensureRepositoryReady: async () => ({}),
          ensureWorktreeReady: async () => ({}),
          refreshRepositoryViews: async () => {},
        },
        launchAgent: async () => ({}),
        workdir: '/workdir',
        planEnabled: true,
        routeLabel: 'create-plan',
        prompt: 'Prompt',
        org: 'acme',
        repo: 'web',
        agent: { key: 'codex', command: 'cmd' },
        requestId: 'req-3',
        worktreeInput: '',
        branchNameGenerator: null,
        defaultBranches: null,
        planService: null,
        finishSuccess: () => {},
        finishFailure: () => {},
        onBranchResolved: () => {},
      }),
    ).rejects.toBeInstanceOf(AutomationRequestError);
  });
});
