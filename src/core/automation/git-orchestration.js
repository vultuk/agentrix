/**
 * Git/worktree orchestration helpers used by the automation task runner.
 */

export async function ensureRepositoryReady({
  ensureRepositoryExists,
  workdir,
  org,
  repo,
}) {
  const { repositoryPath, cloned } = await ensureRepositoryExists(workdir, org, repo);
  return { repositoryPath, clonedRepository: cloned };
}

export async function ensureWorktreeReady({
  ensureWorktreeExists,
  workdir,
  org,
  repo,
  branch,
  defaultBranchOverride,
}) {
  const { worktreePath, created } = await ensureWorktreeExists(workdir, org, repo, branch, {
    defaultBranchOverride,
  });

  return { worktreePath, createdWorktree: created };
}

export async function refreshRepositoryViews({
  discoverRepositories,
  emitReposUpdate,
  workdir,
}) {
  const reposSnapshot = await discoverRepositories(workdir);
  emitReposUpdate(reposSnapshot);
}

export function createGitOrchestrator({
  ensureRepositoryExists,
  ensureWorktreeExists,
  discoverRepositories,
  emitReposUpdate,
}) {
  return {
    ensureRepositoryReady: (args) =>
      ensureRepositoryReady({ ensureRepositoryExists, ...args }),
    ensureWorktreeReady: (args) =>
      ensureWorktreeReady({ ensureWorktreeExists, ...args }),
    refreshRepositoryViews: (args) =>
      refreshRepositoryViews({ discoverRepositories, emitReposUpdate, ...args }),
  };
}
