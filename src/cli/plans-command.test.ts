import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

describe('plans CLI command', () => {
  it('prints help when no command is provided', async () => {
    const stdout: string[] = [];
    const stdoutMock = mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
      stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });

    try {
      const { handlePlansCommand } = await import('./plans-command.js?test=help');
      await handlePlansCommand([]);
    } finally {
      stdoutMock.mock.restore();
      mock.restoreAll();
    }

    assert.ok(stdout.join('').includes('Usage: agentrix plans'));
  });

  it('handles list command and prints plan identifiers', async () => {
    const stdout: string[] = [];
    const stdoutMock = mock.method(process.stdout, 'write', (chunk: string | Uint8Array) => {
      stdout.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });

    try {
      const { handlePlansCommand, __setPlansCommandTestOverrides } = await import('./plans-command.js?test=list');
      __setPlansCommandTestOverrides({
        getWorktreePath: async () => ({ worktreePath: '/tmp/worktree' }),
        listPlansForWorktree: async () => [
          { id: 'plan-1', createdAt: '2024-01-01T00:00:00Z' },
          { id: 'plan-2', createdAt: '2024-01-02T00:00:00Z' },
        ],
        readPlanFromWorktree: async () => ({ id: 'plan-1', content: 'content' }),
      });
      await handlePlansCommand(['list', '--org', 'org', '--repo', 'repo', '--branch', 'branch']);
      __setPlansCommandTestOverrides();
    } finally {
      stdoutMock.mock.restore();
    }

    const output = stdout.join('');
    assert.ok(output.includes('plan-1'));
    assert.ok(output.includes('plan-2'));
  });

  it('requires planId for show command', async () => {
    const stderr: string[] = [];
    const stderrMock = mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
      stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });

    const originalExitCode = process.exitCode;
    try {
      const { handlePlansCommand, __setPlansCommandTestOverrides } = await import('./plans-command.js?test=show-missing');
      __setPlansCommandTestOverrides({
        getWorktreePath: async () => ({ worktreePath: '/tmp/worktree' }),
        readPlanFromWorktree: async () => ({ id: 'plan-1', content: 'content' }),
        listPlansForWorktree: async () => [],
      });
      await handlePlansCommand(['show', '--org', 'org', '--repo', 'repo', '--branch', 'branch']);
      __setPlansCommandTestOverrides();
    } finally {
      process.exitCode = originalExitCode ?? 0;
      stderrMock.mock.restore();
    }

    assert.ok(stderr.join('').includes('planId is required'));
  });

  it('reports unknown commands and sets exit code', async () => {
    const stderr: string[] = [];
    const stderrMock = mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
      stderr.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });

    const originalExitCode = process.exitCode;
    try {
      const { handlePlansCommand } = await import('./plans-command.js?test=unknown');
      await handlePlansCommand(['unknown']);
      assert.equal(process.exitCode, 1);
    } finally {
      process.exitCode = originalExitCode ?? 0;
      stderrMock.mock.restore();
    }

    assert.ok(stderr.join('').includes('Unknown plans command'));
  });
});

