import { createWorktreeService, type WorktreeService } from '../services/index.js';
import { createHandler } from './base-handler.js';
import { validateWorktreeCreate, validateWorktreeDelete } from '../validation/index.js';
import type { WorktreeCreateInput, WorktreeDeleteInput } from '../validation/index.js';

export interface WorktreeHandlerOverrides {
  worktreeService?: WorktreeService;
}

export function createWorktreeHandlers(
  workdir: string,
  branchNameGenerator: unknown,
  defaultBranchConfig: unknown,
  overrides: WorktreeHandlerOverrides = {}
) {
  const worktreeService =
    overrides.worktreeService ?? createWorktreeService(workdir, branchNameGenerator, defaultBranchConfig);

  const createWorktree = createHandler({
    validator: validateWorktreeCreate,
    handler: async (input: WorktreeCreateInput) => worktreeService.createWorktree(input),
    successCode: 202,
  });

  const deleteWorktree = createHandler({
    validator: validateWorktreeDelete,
    handler: async (input: WorktreeDeleteInput) => {
      const data = await worktreeService.deleteWorktree(input);
      return { data };
    },
  });

  return { 
    create: createWorktree,
    delete: deleteWorktree,
    // Deprecated aliases for backward compatibility
    upsert: createWorktree,
    destroy: deleteWorktree,
  };
}
