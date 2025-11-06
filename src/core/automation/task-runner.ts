/* c8 ignore file */
/**
 * Coordinates the asynchronous automation launch task, updating task progress and metadata.
 */

export const TASK_TYPE_AUTOMATION = 'automation:launch';

export const STEP_IDS = Object.freeze({
  ENSURE_REPO: 'ensure-repository',
  GENERATE_PLAN: 'generate-plan',
  ENSURE_WORKTREE: 'ensure-worktree',
  LAUNCH_AGENT: 'launch-agent',
  REFRESH_REPOS: 'refresh-repositories',
});

export const STEP_LABELS = Object.freeze({
  [STEP_IDS.ENSURE_REPO]: 'Ensure repository',
  [STEP_IDS.GENERATE_PLAN]: 'Generate plan',
  [STEP_IDS.ENSURE_WORKTREE]: 'Ensure worktree',
  [STEP_IDS.LAUNCH_AGENT]: 'Launch agent',
  [STEP_IDS.REFRESH_REPOS]: 'Refresh repositories',
});

export interface RunAutomationTaskParams {
  runTaskImpl: (config: unknown, executor: (context: unknown) => Promise<unknown>) => Promise<unknown>;
  resolveBranchName: (params: unknown) => Promise<unknown>;
  generatePlanText: (params: unknown) => Promise<unknown>;
  gitOrchestrator: unknown;
  launchAgent: (params: unknown) => Promise<void>;
  workdir: string;
  planEnabled: boolean;
  routeLabel: string;
  prompt: string;
  org: string;
  repo: string;
  agent: string;
  requestId: string;
  worktreeInput?: string;
  branchNameGenerator: unknown;
  defaultBranches: unknown;
  planService: unknown;
  finishSuccess: (response: unknown) => void;
  finishFailure: (error: unknown) => void;
  onBranchResolved?: (branch: string) => void;
}

export async function runAutomationTask({
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
  onBranchResolved,
}: RunAutomationTaskParams): Promise<void> {
  if (typeof runTaskImpl !== 'function') {
    throw new Error('runTask implementation is required');
  }
  if (!gitOrchestrator) {
    throw new Error('git orchestrator is required');
  }

  const orchestrator = gitOrchestrator as {
    ensureRepositoryReady: (workdir: string, org: string, repo: string) => Promise<{ repositoryPath: string; cloned: boolean }>;
    ensureWorktreeReady: (workdir: string, org: string, repo: string, branch: string, options?: unknown) => Promise<{ worktreePath: string; created: boolean }>;
    refreshRepositoryViews: (workdir: string) => Promise<void>;
  };
  const { ensureRepositoryReady, ensureWorktreeReady, refreshRepositoryViews } = orchestrator;

  const branchResult = await resolveBranchName({
    worktreeInput,
    branchNameGenerator,
    prompt,
    org,
    repo,
    defaultBranches,
  }) as { branch: string; defaultBranchOverride?: string; source: string };
  const { branch, defaultBranchOverride } = branchResult;

  if (typeof onBranchResolved === 'function') {
    onBranchResolved(branch);
  }

  const agentData = agent as unknown as { key: string; command: string };
  const taskMetadata = {
    automationRequestId: requestId,
    planEnabled,
    promptProvided: Boolean(prompt.trim()),
    org,
    repo,
    branch,
    command: agentData.key,
    status: 'pending',
  };

  const taskResult = runTaskImpl(
    {
      type: TASK_TYPE_AUTOMATION,
      title: `Automation launch for ${org}/${repo}`,
      metadata: taskMetadata,
    },
    async (context: unknown) => {
      const ctx = context as {
        progress: {
          ensureStep: (id: string, label: string) => void;
          startStep: (id: string, options: { label: string; message: string }) => void;
          completeStep: (id: string, options: { label: string; message: string }) => void;
          failStep: (id: string, options: { label: string; message: string }) => void;
          skipStep: (id: string, options: { label: string; message: string }) => void;
        };
        setResult: (result: unknown) => void;
        updateMetadata: (update: unknown) => void;
      };
      const { progress, setResult, updateMetadata } = ctx;
      const finalData: {
        org: string;
        repo: string;
        branch: string;
        plan: boolean;
        promptRoute: string;
        automationRequestId: string;
        agent: string;
        agentCommand: unknown;
        repositoryPath: string | null;
        worktreePath: string | null;
        clonedRepository: boolean;
        createdWorktree: boolean;
        pid: number | null;
        terminalSessionId: string | null;
        terminalSessionCreated: boolean;
        tmuxSessionName: string | null;
        terminalUsingTmux: boolean;
      } = {
        org,
        repo,
        branch,
        plan: planEnabled,
        promptRoute: routeLabel,
        automationRequestId: requestId,
        agent: agentData.key,
        agentCommand: agentData.command,
        repositoryPath: null,
        worktreePath: null,
        clonedRepository: false,
        createdWorktree: false,
        pid: null,
        terminalSessionId: null,
        terminalSessionCreated: false,
        tmuxSessionName: null,
        terminalUsingTmux: false,
      };

      let currentStep: string | null = null;
      const startStep = (id: string, message: string): void => {
        currentStep = id;
        progress.startStep(id, { label: STEP_LABELS[id as keyof typeof STEP_LABELS], message });
      };
      const completeStep = (id: string, message: string): void => {
        progress.completeStep(id, { label: STEP_LABELS[id as keyof typeof STEP_LABELS], message });
        if (currentStep === id) {
          currentStep = null;
        }
      };
      const failCurrentStep = (message: string): void => {
        if (!currentStep) {
          return;
        }
        progress.failStep(currentStep, { label: STEP_LABELS[currentStep as keyof typeof STEP_LABELS], message });
        currentStep = null;
      };

      progress.ensureStep(STEP_IDS.ENSURE_REPO, STEP_LABELS[STEP_IDS.ENSURE_REPO]);
      progress.ensureStep(STEP_IDS.GENERATE_PLAN, STEP_LABELS[STEP_IDS.GENERATE_PLAN]);
      progress.ensureStep(STEP_IDS.ENSURE_WORKTREE, STEP_LABELS[STEP_IDS.ENSURE_WORKTREE]);
      progress.ensureStep(STEP_IDS.LAUNCH_AGENT, STEP_LABELS[STEP_IDS.LAUNCH_AGENT]);
      progress.ensureStep(STEP_IDS.REFRESH_REPOS, STEP_LABELS[STEP_IDS.REFRESH_REPOS]);

      updateMetadata({ status: 'running' });

      try {
        startStep(STEP_IDS.ENSURE_REPO, 'Ensuring repository exists.');
        const repoResult = await ensureRepositoryReady(workdir, org, repo);
        const { repositoryPath, cloned: clonedRepository } = repoResult;
        finalData.repositoryPath = repositoryPath as never;
        finalData.clonedRepository = clonedRepository as never;
        updateMetadata({ repositoryPath, clonedRepository });
        completeStep(
          STEP_IDS.ENSURE_REPO,
          clonedRepository ? 'Repository cloned successfully.' : 'Repository is ready.',
        );

        let effectivePrompt = prompt;
        if (planEnabled) {
          startStep(STEP_IDS.GENERATE_PLAN, 'Generating plan text.');
          try {
            const planResult = (await generatePlanText({
              planEnabled,
              prompt,
              planService,
              repositoryPath,
            })) as { promptToExecute: string; planGenerated: boolean };
            effectivePrompt = planResult.promptToExecute;
            completeStep(STEP_IDS.GENERATE_PLAN, 'Plan generated successfully.');
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failCurrentStep(message);
            updateMetadata({ status: 'failed', error: message });
            throw error instanceof Error ? error : new Error(message);
          }
        } else {
          progress.skipStep(STEP_IDS.GENERATE_PLAN, {
            label: STEP_LABELS[STEP_IDS.GENERATE_PLAN],
            message: 'Plan generation disabled for this request.',
          });
        }

        startStep(STEP_IDS.ENSURE_WORKTREE, 'Ensuring worktree is available.');
        const worktreeResult = await ensureWorktreeReady(workdir, org, repo, branch, { defaultBranchOverride });
        const { worktreePath, created: createdWorktree } = worktreeResult;
        finalData.worktreePath = worktreePath as never;
        finalData.createdWorktree = createdWorktree as never;
        updateMetadata({ worktreePath, createdWorktree });
        completeStep(
          STEP_IDS.ENSURE_WORKTREE,
          createdWorktree ? 'Worktree created successfully.' : 'Worktree already existed.',
        );

        startStep(STEP_IDS.REFRESH_REPOS, 'Refreshing repository view.');
        try {
          await refreshRepositoryViews(workdir);
          completeStep(STEP_IDS.REFRESH_REPOS, 'Repository view updated.');
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          failCurrentStep(message);
          updateMetadata({ status: 'failed', error: message });
          finishFailure(error);
          throw error instanceof Error ? error : new Error(message);
        }

        startStep(STEP_IDS.LAUNCH_AGENT, 'Launching agent command.');
        const launchResult = (await launchAgent({
          command: agentData.command,
          workdir,
          org,
          repo,
          branch,
          prompt: effectivePrompt,
        }) as unknown) as {
          pid: number | null;
          sessionId: string;
          tmuxSessionName: string | null;
          usingTmux: boolean;
          createdSession: boolean;
        };
        const {
          pid,
          sessionId,
          tmuxSessionName,
          usingTmux,
          createdSession,
        } = launchResult;

        finalData.pid = pid;
        finalData.terminalSessionId = sessionId;
        finalData.terminalSessionCreated = createdSession;
        finalData.tmuxSessionName = tmuxSessionName;
        finalData.terminalUsingTmux = usingTmux;

        updateMetadata({
          pid,
          terminalSessionId: sessionId,
          terminalSessionCreated: createdSession,
          tmuxSessionName,
          terminalUsingTmux: usingTmux,
        });

        completeStep(STEP_IDS.LAUNCH_AGENT, 'Agent launched successfully.');

        finishSuccess(`${org}/${repo}#${branch}`);
        updateMetadata({ status: 'succeeded' });
        setResult(finalData);
        return finalData;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        failCurrentStep(message);
        updateMetadata({ status: 'failed', error: message });
        finishFailure(error);
        if (!(error instanceof Error)) {
          throw new Error(message);
        }
        throw error;
      }
    },
  );

  const queuedData = {
    org,
    repo,
    branch,
    repositoryPath: null,
    worktreePath: null,
    clonedRepository: null,
    createdWorktree: null,
    agent: agentData.key,
    agentCommand: agentData.command,
    pid: null,
    terminalSessionId: null,
    terminalSessionCreated: false,
    tmuxSessionName: null,
    terminalUsingTmux: false,
    plan: planEnabled,
    promptRoute: routeLabel,
    automationRequestId: requestId,
  };

  const task = (await taskResult) as unknown as { id: string };
  return { taskId: task.id, queuedData, branch } as never;
}
