import { describe, test, expect } from 'bun:test';
import {
  ensureRepositoryReady,
  ensureWorktreeReady,
  refreshRepositoryViews,
  createGitOrchestrator,
} from '../git-orchestration.js';

describe('git-orchestration', () => {
  test('ensureRepositoryReady wraps repository helper', async () => {
    const calls = [];
    const result = await ensureRepositoryReady({
      ensureRepositoryExists: async (workdir, org, repo) => {
        calls.push({ workdir, org, repo });
        return { repositoryPath: '/repos/org/repo', cloned: true };
      },
      workdir: '/workdir',
      org: 'acme',
      repo: 'app',
    });

    expect(calls).toEqual([{ workdir: '/workdir', org: 'acme', repo: 'app' }]);
    expect(result).toEqual({
      repositoryPath: '/repos/org/repo',
      clonedRepository: true,
    });
  });

  test('ensureWorktreeReady wraps worktree helper', async () => {
    const calls = [];
    const result = await ensureWorktreeReady({
      ensureWorktreeExists: async (workdir, org, repo, branch, options) => {
        calls.push({ workdir, org, repo, branch, options });
        return { worktreePath: '/repos/org/repo/feature', created: false };
      },
      workdir: '/workdir',
      org: 'acme',
      repo: 'app',
      branch: 'feature/test',
      defaultBranchOverride: 'develop',
    });

    expect(calls).toEqual([
      {
        workdir: '/workdir',
        org: 'acme',
        repo: 'app',
        branch: 'feature/test',
        options: { defaultBranchOverride: 'develop' },
      },
    ]);
    expect(result).toEqual({
      worktreePath: '/repos/org/repo/feature',
      createdWorktree: false,
    });
  });

  test('refreshRepositoryViews discovers repos and emits update', async () => {
    const discoverCalls = [];
    const emitCalls = [];

    await refreshRepositoryViews({
      discoverRepositories: async (workdir) => {
        discoverCalls.push(workdir);
        return [{ org: 'acme', repo: 'app' }];
      },
      emitReposUpdate: (payload) => {
        emitCalls.push(payload);
      },
      workdir: '/workdir',
    });

    expect(discoverCalls).toEqual(['/workdir']);
    expect(emitCalls).toEqual([[{ org: 'acme', repo: 'app' }]]);
  });

  test('createGitOrchestrator injects shared dependencies', async () => {
    const orchestrator = createGitOrchestrator({
      ensureRepositoryExists: async () => ({ repositoryPath: '/repo', cloned: false }),
      ensureWorktreeExists: async () => ({ worktreePath: '/repo/worktree', created: true }),
      discoverRepositories: async () => ['snapshot'],
      emitReposUpdate: () => {},
    });

    const repository = await orchestrator.ensureRepositoryReady({
      workdir: '/root',
      org: 'acme',
      repo: 'service',
    });
    const worktree = await orchestrator.ensureWorktreeReady({
      workdir: '/root',
      org: 'acme',
      repo: 'service',
      branch: 'feature',
      defaultBranchOverride: 'main',
    });
    const refresh = await orchestrator.refreshRepositoryViews({ workdir: '/root' });

    expect(repository).toEqual({ repositoryPath: '/repo', clonedRepository: false });
    expect(worktree).toEqual({ worktreePath: '/repo/worktree', createdWorktree: true });
    expect(refresh).toBeUndefined();
  });
});
