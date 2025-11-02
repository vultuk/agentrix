import {
  createWorktree,
  discoverRepositories,
  getWorktreePath,
  normaliseBranchName,
  removeWorktree,
} from '../core/git.js';
import { selectDefaultBranchOverride } from '../core/default-branch.js';
import {
  detectTmux,
  isTmuxAvailable,
  makeTmuxSessionName,
  tmuxKillSession,
} from '../core/tmux.js';
import { disposeSessionByKey, makeSessionKey } from '../core/terminal-sessions.js';
import { savePlanToWorktree } from '../core/plan-storage.js';
import { emitReposUpdate } from '../core/event-bus.js';
import { runTask } from '../core/tasks.js';
import { sendJson } from '../utils/http.js';

const TASK_TYPE_CREATE_WORKTREE = 'worktree:create';

const STEP_IDS = Object.freeze({
  GENERATE_BRANCH: 'generate-branch',
  SYNC_DEFAULT_BRANCH: 'sync-default-branch',
  CREATE_WORKTREE: 'create-worktree',
  RUN_INIT_SCRIPT: 'run-init-script',
  SAVE_PLAN: 'save-plan',
  REFRESH_REPOSITORIES: 'refresh-repositories',
});

export function createWorktreeHandlers(workdir, branchNameGenerator, defaultBranchConfig) {
  async function upsert(context) {
    let payload;
    try {
      payload = await context.readJsonBody();
    } catch (error) {
      sendJson(context.res, 400, { error: error.message });
      return;
    }

    const org = typeof payload.org === 'string' ? payload.org.trim() : '';
    const repo = typeof payload.repo === 'string' ? payload.repo.trim() : '';
    const rawPrompt = typeof payload.prompt === 'string' ? payload.prompt : '';
    const prompt = rawPrompt.trim();
    const branchInput = typeof payload.branch === 'string' ? payload.branch.trim() : '';

    if (!org || !repo) {
      sendJson(context.res, 400, { error: 'org and repo are required' });
      return;
    }

    let normalisedBranch = normaliseBranchName(branchInput);
    const hasPrompt = Boolean(prompt);

    if (!normalisedBranch) {
      if (!branchNameGenerator || !branchNameGenerator.isConfigured) {
        sendJson(context.res, 503, {
          error:
            'Branch name generation is not configured. Provide a branch or configure a local LLM command (set branchNameLlm in config.json).',
        });
        return;
      }
    }

    const defaultBranchOverride = selectDefaultBranchOverride(defaultBranchConfig, org, repo);

    try {
      const { id: taskId } = runTask(
        {
          type: TASK_TYPE_CREATE_WORKTREE,
          title: `Create worktree for ${org}/${repo}`,
          metadata: {
            org,
            repo,
            requestedBranch: normalisedBranch || null,
            promptProvided: hasPrompt,
          },
        },
        async ({ progress, updateMetadata, setResult }) => {
          let targetBranch = normalisedBranch;

          progress.ensureStep(STEP_IDS.GENERATE_BRANCH, 'Generate branch name');

          if (!targetBranch) {
            progress.startStep(STEP_IDS.GENERATE_BRANCH, {
              label: 'Generate branch name',
              message: 'Generating branch name from prompt.',
            });
            try {
              const generated = await branchNameGenerator.generateBranchName({ prompt, org, repo });
              const trimmed = normaliseBranchName(generated);
              if (!trimmed) {
                throw new Error('Branch name generator returned an empty branch name.');
              }
              targetBranch = trimmed;
              updateMetadata({ branch: targetBranch });
              progress.completeStep(STEP_IDS.GENERATE_BRANCH, {
                label: 'Generate branch name',
                message: `Generated branch ${targetBranch}.`,
              });
            } catch (error) {
              const message = error?.message || 'Failed to generate branch name.';
              progress.failStep(STEP_IDS.GENERATE_BRANCH, {
                label: 'Generate branch name',
                message,
              });
              throw new Error(`Failed to generate branch name: ${message}`);
            }
          } else {
            progress.skipStep(STEP_IDS.GENERATE_BRANCH, {
              label: 'Generate branch name',
              message: `Using provided branch ${targetBranch}.`,
            });
            updateMetadata({ branch: targetBranch });
          }

          progress.ensureStep(STEP_IDS.SYNC_DEFAULT_BRANCH, 'Sync default branch');
          progress.ensureStep(STEP_IDS.CREATE_WORKTREE, 'Create worktree');
          progress.ensureStep(STEP_IDS.RUN_INIT_SCRIPT, 'Run init script');

          await createWorktree(workdir, org, repo, targetBranch, {
            defaultBranchOverride,
            progress,
          });

          if (hasPrompt) {
            progress.ensureStep(STEP_IDS.SAVE_PLAN, 'Save plan prompt');
            progress.startStep(STEP_IDS.SAVE_PLAN, {
              label: 'Save plan prompt',
              message: 'Persisting plan to the new worktree.',
            });
            try {
              const { worktreePath } = await getWorktreePath(workdir, org, repo, targetBranch);
              await savePlanToWorktree({
                worktreePath,
                branch: targetBranch,
                planText: rawPrompt,
              });
              progress.completeStep(STEP_IDS.SAVE_PLAN, {
                label: 'Save plan prompt',
                message: 'Plan saved to worktree.',
              });
            } catch (error) {
              const message = error?.message || 'Failed to persist plan for worktree.';
              progress.failStep(STEP_IDS.SAVE_PLAN, {
                label: 'Save plan prompt',
                message,
              });
              console.warn(
                '[terminal-worktree] Failed to persist plan for worktree:',
                error?.message || error,
              );
            }
          }

          progress.ensureStep(STEP_IDS.REFRESH_REPOSITORIES, 'Refresh repositories');
          progress.startStep(STEP_IDS.REFRESH_REPOSITORIES, {
            label: 'Refresh repositories',
            message: 'Refreshing repository cache.',
          });
          try {
            const data = await discoverRepositories(workdir);
            emitReposUpdate(data);
            progress.completeStep(STEP_IDS.REFRESH_REPOSITORIES, {
              label: 'Refresh repositories',
              message: 'Repository cache refreshed.',
            });
          } catch (error) {
            const message = error?.message || 'Failed to refresh repository list.';
            progress.failStep(STEP_IDS.REFRESH_REPOSITORIES, {
              label: 'Refresh repositories',
              message,
            });
            throw new Error(`Failed to refresh repositories: ${message}`);
          }

          setResult({
            org,
            repo,
            branch: targetBranch,
            promptProvided: hasPrompt,
          });
        },
      );

      sendJson(context.res, 202, {
        taskId,
        org,
        repo,
        branch: normalisedBranch || null,
      });
    } catch (error) {
      sendJson(context.res, 500, { error: error.message });
    }
  }

  async function destroy(context) {
    let payload;
    try {
      payload = await context.readJsonBody();
    } catch (error) {
      sendJson(context.res, 400, { error: error.message });
      return;
    }

    const org = typeof payload.org === 'string' ? payload.org.trim() : '';
    const repo = typeof payload.repo === 'string' ? payload.repo.trim() : '';
    const branch = typeof payload.branch === 'string' ? payload.branch.trim() : '';
    const normalised = normaliseBranchName(branch);

    if (!org || !repo || !normalised) {
      sendJson(context.res, 400, { error: 'org, repo, and branch are required' });
      return;
    }

    const overrideDefault = selectDefaultBranchOverride(defaultBranchConfig, org, repo);
    const protectedBranch = overrideDefault ? overrideDefault.toLowerCase() : 'main';
    if (normalised.toLowerCase() === protectedBranch) {
      sendJson(context.res, 500, {
        error: `Cannot remove the default worktree (${overrideDefault || 'main'})`,
      });
      return;
    }

    try {
      const sessionKey = makeSessionKey(org, repo, normalised);
      await disposeSessionByKey(sessionKey);
      await detectTmux();
      if (isTmuxAvailable()) {
        const tmuxSessionName = makeTmuxSessionName(org, repo, normalised);
        try {
          await tmuxKillSession(tmuxSessionName);
        } catch (error) {
          console.warn(`[terminal-worktree] Failed to kill tmux session ${tmuxSessionName}:`, error.message);
        }
      }

      await removeWorktree(workdir, org, repo, normalised);
      const data = await discoverRepositories(workdir);
      sendJson(context.res, 200, { data });
      emitReposUpdate(data);
    } catch (error) {
      sendJson(context.res, 500, { error: error.message });
    }
  }

  return { upsert, destroy };
}
