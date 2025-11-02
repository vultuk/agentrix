import { describe, test, expect } from 'bun:test';
import { resolveBranchName } from '../branch.js';
import { AutomationRequestError } from '../request-validation.js';

describe('branch.resolveBranchName', () => {
  test('sanitises provided worktree descriptor', async () => {
    const result = await resolveBranchName({
      worktreeInput: 'Feature / Login Revamp',
      branchNameGenerator: null,
      prompt: 'ignored',
      org: 'acme',
      repo: 'web',
      defaultBranches: {
        overrides: { 'acme/web': 'develop' },
      },
    });

    expect(result.branch).toBe('feature/login-revamp');
    expect(result.defaultBranchOverride).toBe('develop');
    expect(result.source).toBe('worktree');
  });

  test('throws when worktree descriptor is invalid', async () => {
    await expect(
      resolveBranchName({
        worktreeInput: 'invalid',
        branchNameGenerator: null,
        prompt: 'ignored',
        org: 'acme',
        repo: 'app',
      }),
    ).rejects.toBeInstanceOf(AutomationRequestError);
  });

  test('throws when branch generator is not configured and worktree omitted', async () => {
    const error = await resolveBranchName({
      worktreeInput: '',
      branchNameGenerator: null,
      prompt: 'Implement feature',
      org: 'acme',
      repo: 'api',
    }).catch((err) => err);

    expect(error).toBeInstanceOf(AutomationRequestError);
    expect(error.status).toBe(503);
  });

  test('delegates to branch generator when worktree is missing', async () => {
    const branchNameGenerator = {
      isConfigured: true,
      async generateBranchName({ prompt, org, repo }) {
        expect(prompt).toBe('Reduce latency');
        expect(org).toBe('acme');
        expect(repo).toBe('infra');
        return 'opt/perf-updates';
      },
    };

    const result = await resolveBranchName({
      worktreeInput: '',
      branchNameGenerator,
      prompt: 'Reduce latency',
      org: 'acme',
      repo: 'infra',
      defaultBranches: { global: 'main' },
    });

    expect(result.branch).toBe('opt/perf-updates');
    expect(result.defaultBranchOverride).toBe('main');
    expect(result.source).toBe('generator');
  });

  test('wraps branch generator failures as AutomationRequestError', async () => {
    const branchNameGenerator = {
      isConfigured: true,
      async generateBranchName() {
        throw new Error('LLM offline');
      },
    };

    const error = await resolveBranchName({
      worktreeInput: '',
      branchNameGenerator,
      prompt: 'Fix tests',
      org: 'acme',
      repo: 'cli',
    }).catch((err) => err);

    expect(error).toBeInstanceOf(AutomationRequestError);
    expect(error.status).toBe(500);
    expect(error.message).toBe('LLM offline');
  });
});
