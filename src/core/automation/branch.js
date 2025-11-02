import { selectDefaultBranchOverride } from '../default-branch.js';
import {
  AutomationRequestError,
  sanitiseWorktreeDescriptor,
} from './request-validation.js';

/**
 * Branch resolution for automation requests, whether supplied by the client or generated.
 */

export async function resolveBranchName({
  worktreeInput,
  branchNameGenerator,
  prompt,
  org,
  repo,
  defaultBranches,
}) {
  const defaultBranchOverride = selectDefaultBranchOverride(defaultBranches, org, repo);

  if (worktreeInput) {
    const branch = sanitiseWorktreeDescriptor(worktreeInput);
    return { branch, defaultBranchOverride, source: 'worktree' };
  }

  if (!branchNameGenerator || !branchNameGenerator.isConfigured) {
    throw new AutomationRequestError(
      503,
      'Branch name generation is not configured. Provide a worktree name or configure a local LLM command (set branchNameLlm in config.json).',
    );
  }

  try {
    const branch = await branchNameGenerator.generateBranchName({
      prompt,
      org,
      repo,
    });

    if (!branch) {
      throw new AutomationRequestError(500, 'Failed to determine branch name.');
    }

    return { branch, defaultBranchOverride, source: 'generator' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AutomationRequestError(
      500,
      message,
      error instanceof Error ? error : undefined,
    );
  }
}
