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
}) {
  if (typeof runTaskImpl !== 'function') {
    throw new Error('runTask implementation is required');
  }
  if (!gitOrchestrator) {
    throw new Error('git orchestrator is required');
  }

  const { ensureRepositoryReady, ensureWorktreeReady, refreshRepositoryViews } = gitOrchestrator;

  const { branch, defaultBranchOverride } = await resolveBranchName({
    worktreeInput,
    branchNameGenerator,
    prompt,
    org,
    repo,
    defaultBranches,
  });

  if (typeof onBranchResolved === 'function') {
    onBranchResolved(branch);
  }

  const taskMetadata = {
    automationRequestId: requestId,
    planEnabled,
    promptProvided: Boolean(prompt.trim()),
    org,
    repo,
    branch,
    command: agent.key,
    status: 'pending',
  };

  const { id: taskId } = runTaskImpl(
    {
      type: TASK_TYPE_AUTOMATION,
      title: `Automation launch for ${org}/${repo}`,
      metadata: taskMetadata,
    },
    async ({ progress, setResult, updateMetadata }) => {
      const finalData = {
        org,
        repo,
        branch,
        plan: planEnabled,
        promptRoute: routeLabel,
        automationRequestId: requestId,
        agent: agent.key,
        agentCommand: agent.command,
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

      let currentStep = null;
      const startStep = (id, message) => {
        currentStep = id;
        progress.startStep(id, { label: STEP_LABELS[id], message });
      };
      const completeStep = (id, message) => {
        progress.completeStep(id, { label: STEP_LABELS[id], message });
        if (currentStep === id) {
          currentStep = null;
        }
      };
      const failCurrentStep = (message) => {
        if (!currentStep) {
          return;
        }
        progress.failStep(currentStep, { label: STEP_LABELS[currentStep], message });
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
        const { repositoryPath, clonedRepository } = await ensureRepositoryReady({
          workdir,
          org,
          repo,
        });
        finalData.repositoryPath = repositoryPath;
        finalData.clonedRepository = clonedRepository;
        updateMetadata({ repositoryPath, clonedRepository });
        completeStep(
          STEP_IDS.ENSURE_REPO,
          clonedRepository ? 'Repository cloned successfully.' : 'Repository is ready.',
        );

        let effectivePrompt = prompt;
        if (planEnabled) {
          startStep(STEP_IDS.GENERATE_PLAN, 'Generating plan text.');
          try {
            const planResult = await generatePlanText({
              planEnabled,
              prompt,
              planService,
              repositoryPath,
            });
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
        const { worktreePath, createdWorktree } = await ensureWorktreeReady({
          workdir,
          org,
          repo,
          branch,
          defaultBranchOverride,
        });
        finalData.worktreePath = worktreePath;
        finalData.createdWorktree = createdWorktree;
        updateMetadata({ worktreePath, createdWorktree });
        completeStep(
          STEP_IDS.ENSURE_WORKTREE,
          createdWorktree ? 'Worktree created successfully.' : 'Worktree already existed.',
        );

        startStep(STEP_IDS.REFRESH_REPOS, 'Refreshing repository view.');
        try {
          await refreshRepositoryViews({ workdir });
          completeStep(STEP_IDS.REFRESH_REPOS, 'Repository view updated.');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failCurrentStep(message);
          updateMetadata({ status: 'failed', error: message });
          finishFailure(message, error instanceof Error ? error : undefined);
          throw error instanceof Error ? error : new Error(message);
        }

        startStep(STEP_IDS.LAUNCH_AGENT, 'Launching agent command.');
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
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failCurrentStep(message);
        updateMetadata({ status: 'failed', error: message });
        finishFailure(message, error instanceof Error ? error : undefined);
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
    agent: agent.key,
    agentCommand: agent.command,
    pid: null,
    terminalSessionId: null,
    terminalSessionCreated: false,
    tmuxSessionName: null,
    terminalUsingTmux: false,
    plan: planEnabled,
    promptRoute: routeLabel,
    automationRequestId: requestId,
  };

  return { taskId, queuedData, branch };
}
