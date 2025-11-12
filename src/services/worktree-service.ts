/* c8 ignore file */
import {
  createWorktree,
  getWorktreePath,
  normalizeBranchName,
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
import { runTask } from '../core/tasks.js';
import { refreshRepositoryCache } from '../utils/repository-cache.js';
import type { WorktreeCreateInput, WorktreeDeleteInput } from '../validation/index.js';
import type { RepositoriesData } from './repository-service.js';
import type { IWorktreeService } from '../types/services.js';

const TASK_TYPE_CREATE_WORKTREE = 'worktree:create';

const STEP_IDS = Object.freeze({
  GENERATE_BRANCH: 'generate-branch',
  SYNC_DEFAULT_BRANCH: 'sync-default-branch',
  CREATE_WORKTREE: 'create-worktree',
  RUN_INIT_SCRIPT: 'run-init-script',
  SAVE_PLAN: 'save-plan',
  REFRESH_REPOSITORIES: 'refresh-repositories',
});

export interface CreateWorktreeResult {
  taskId: string;
  org: string;
  repo: string;
  branch: string | null;
}

/**
 * Service for worktree lifecycle management
 */
export class WorktreeService implements IWorktreeService {
  constructor(
    private readonly workdir: string,
    private readonly branchNameGenerator: unknown,
    private readonly defaultBranchConfig: unknown
  ) {}

  /**
   * Creates a new worktree
   * @param params - Creation parameters
   * @returns Result with task ID and repository info
   */
  async createWorktree(params: WorktreeCreateInput): Promise<CreateWorktreeResult> {
    const { org, repo, branch, prompt, hasPrompt } = params;
    let normalisedBranch = normalizeBranchName(branch);
    let resolvedBranch: string | null = normalisedBranch || null;

    const generator = this.branchNameGenerator as { isConfigured?: boolean; generateBranchName?: (args: unknown) => Promise<string> };
    if (!normalisedBranch && (!generator || !generator.isConfigured)) {
      throw new Error(
        'Branch name generation is not configured. Provide a branch or configure a local LLM command (set branchNameLlm in config.json).'
      );
    }

    const defaultBranchOverride = selectDefaultBranchOverride(
      this.defaultBranchConfig,
      org,
      repo
    );

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
      async (context: unknown) => {
        const ctx = context as { progress: unknown; updateMetadata: unknown; setResult: unknown };
        const { progress, updateMetadata, setResult } = ctx;
        const prog = progress as {
          ensureStep: (id: string, label: string) => void;
          startStep: (id: string, options: { label: string; message: string }) => void;
          completeStep: (id: string, options: { label: string; message: string }) => void;
          failStep: (id: string, options: { label: string; message: string }) => void;
          skipStep: (id: string, options: { label: string; message: string }) => void;
        };
        const updateMeta = updateMetadata as (data: unknown) => void;
        const setRes = setResult as (data: unknown) => void;

        let targetBranch = normalisedBranch;

        prog.ensureStep(STEP_IDS.GENERATE_BRANCH, 'Generate branch name');

        if (!targetBranch) {
          prog.startStep(STEP_IDS.GENERATE_BRANCH, {
            label: 'Generate branch name',
            message: 'Generating branch name from prompt.',
          });
          try {
            const generated = await generator.generateBranchName!({
              prompt,
              org,
              repo,
            });
            const trimmed = normalizeBranchName(generated);
            if (!trimmed) {
              throw new Error('Branch name generator returned an empty branch name.');
            }
            targetBranch = trimmed;
            updateMeta({ branch: targetBranch });
            resolvedBranch = targetBranch;
            prog.completeStep(STEP_IDS.GENERATE_BRANCH, {
              label: 'Generate branch name',
              message: `Generated branch ${targetBranch}.`,
            });
          } catch (error: unknown) {
            const message = (error as Error)?.message || 'Failed to generate branch name.';
            prog.failStep(STEP_IDS.GENERATE_BRANCH, {
              label: 'Generate branch name',
              message,
            });
            throw new Error(`Failed to generate branch name: ${message}`);
          }
        } else {
          prog.skipStep(STEP_IDS.GENERATE_BRANCH, {
            label: 'Generate branch name',
            message: `Using provided branch ${targetBranch}.`,
          });
          updateMeta({ branch: targetBranch });
          resolvedBranch = targetBranch;
        }

        prog.ensureStep(STEP_IDS.SYNC_DEFAULT_BRANCH, 'Sync default branch');
        prog.ensureStep(STEP_IDS.CREATE_WORKTREE, 'Create worktree');
        prog.ensureStep(STEP_IDS.RUN_INIT_SCRIPT, 'Run init script');

        await createWorktree(this.workdir, org, repo, targetBranch, {
          defaultBranchOverride,
          progress: prog,
        });

        if (hasPrompt) {
          prog.ensureStep(STEP_IDS.SAVE_PLAN, 'Save plan prompt');
          prog.startStep(STEP_IDS.SAVE_PLAN, {
            label: 'Save plan prompt',
            message: 'Persisting plan to the new worktree.',
          });
          try {
            const { worktreePath } = await getWorktreePath(
              this.workdir,
              org,
              repo,
              targetBranch
            );
            await savePlanToWorktree({
              worktreePath,
              branch: targetBranch,
              planText: prompt,
            });
            prog.completeStep(STEP_IDS.SAVE_PLAN, {
              label: 'Save plan prompt',
              message: 'Plan saved to worktree.',
            });
          } catch (error: unknown) {
            const message = (error as Error)?.message || 'Failed to persist plan for worktree.';
            prog.failStep(STEP_IDS.SAVE_PLAN, {
              label: 'Save plan prompt',
              message,
            });
            console.warn(
              '[agentrix] Failed to persist plan for worktree:',
              (error as Error)?.message || error
            );
          }
        }

        prog.ensureStep(STEP_IDS.REFRESH_REPOSITORIES, 'Refresh repositories');
        prog.startStep(STEP_IDS.REFRESH_REPOSITORIES, {
          label: 'Refresh repositories',
          message: 'Refreshing repository cache.',
        });
        try {
          await refreshRepositoryCache(this.workdir);
          prog.completeStep(STEP_IDS.REFRESH_REPOSITORIES, {
            label: 'Refresh repositories',
            message: 'Repository cache refreshed.',
          });
        } catch (error: unknown) {
          const message = (error as Error)?.message || 'Failed to refresh repository list.';
          prog.failStep(STEP_IDS.REFRESH_REPOSITORIES, {
            label: 'Refresh repositories',
            message,
          });
          throw new Error(`Failed to refresh repositories: ${message}`);
        }

        setRes({
          org,
          repo,
          branch: targetBranch,
          promptProvided: hasPrompt,
        });
      }
    );

    return {
      taskId,
      org,
      repo,
      branch: resolvedBranch,
    };
  }

  /**
   * Deletes a worktree
   * @param params - Deletion parameters
   * @returns Updated repository data
   */
  async deleteWorktree(params: WorktreeDeleteInput): Promise<RepositoriesData> {
    const { org, repo, branch } = params;
    const normalised = normalizeBranchName(branch);

    if (!normalised) {
      throw new Error('Branch name cannot be empty');
    }

    const config = this.defaultBranchConfig as { 
      global?: string; 
      repositories?: Record<string, Record<string, string>> 
    } | undefined;
    
    const overrideDefault = selectDefaultBranchOverride(config, org, repo);
    const protectedBranch = overrideDefault ? overrideDefault.toLowerCase() : 'main';

    if (normalised.toLowerCase() === protectedBranch) {
      throw new Error(`Cannot remove the default worktree (${overrideDefault || 'main'})`);
    }

    const sessionKey = makeSessionKey(org, repo, normalised);
    await disposeSessionByKey(sessionKey);

    await detectTmux();
    if (isTmuxAvailable()) {
      const tmuxSessionName = makeTmuxSessionName(org, repo, normalised);
      try {
        await tmuxKillSession(tmuxSessionName);
      } catch (error: unknown) {
        console.warn(
          `[agentrix] Failed to kill tmux session ${tmuxSessionName}:`,
          (error as Error).message
        );
      }
    }

    await removeWorktree(this.workdir, org, repo, normalised);
    return await refreshRepositoryCache(this.workdir);
  }
}

/**
 * Creates a worktree service instance
 * @param workdir - Work directory root
 * @param branchNameGenerator - Branch name generator
 * @param defaultBranchConfig - Default branch configuration
 * @returns WorktreeService instance
 */
export function createWorktreeService(
  workdir: string,
  branchNameGenerator: unknown,
  defaultBranchConfig: unknown
): WorktreeService {
  return new WorktreeService(workdir, branchNameGenerator, defaultBranchConfig);
}
