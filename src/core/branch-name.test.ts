import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { afterEach, describe, it, mock } from 'node:test';

import { __setBranchNameTestOverrides, createBranchNameGenerator } from './branch-name.js';

class MockStream extends EventEmitter {
  setEncoding(): void {}
  off(event: string | symbol, listener: (...args: unknown[]) => void): this {
    this.removeListener(event, listener);
    return this;
  }
}

class MockChildProcess extends EventEmitter {
  public stdout = new MockStream();
  public stderr = new MockStream();
  public killed = false;
  public pid = Math.floor(Math.random() * 10_000) + 1;

  kill = mock.fn((signal: string | undefined = 'SIGTERM') => {
    this.killed = true;
    this.emit('killed', signal);
    return true;
  });
}

type SpawnScenario = (child: MockChildProcess) => void;

type Harness = {
  enqueueScenario: (scenario: SpawnScenario) => void;
  spawnCalls: Array<{ command: string }>;
  loadDeveloperMessageMock: ReturnType<typeof mock.fn>;
  normaliseBranchNameMock: ReturnType<typeof mock.fn>;
};

function setupHarness(): Harness {
  const localScenarios: SpawnScenario[] = [];
  const localSpawnCalls: Array<{ command: string }> = [];
  const loadDeveloperMessageMock = mock.fn(async () => 'Developer message');
  const normaliseBranchNameMock = mock.fn((value: string) => value);

  const spawnStub = (...args: unknown[]) => {
    const commandArgs = Array.isArray(args[1]) ? (args[1] as string[]) : [];
    const command = commandArgs[commandArgs.length - 1] ?? '';
    const child = new MockChildProcess();
    localSpawnCalls.push({ command });
    const scenario = localScenarios.shift();
    if (scenario) {
      scenario(child);
    } else {
      queueMicrotask(() => {
        child.emit('close', 0, null);
      });
    }
    return child as unknown as import('node:child_process').ChildProcess;
  };

  __setBranchNameTestOverrides({
    spawn: spawnStub,
    loadDeveloperMessage: loadDeveloperMessageMock,
    normaliseBranchName: normaliseBranchNameMock,
  });

  return {
    enqueueScenario: (scenario: SpawnScenario) => {
      localScenarios.push(scenario);
    },
    spawnCalls: localSpawnCalls,
    loadDeveloperMessageMock,
    normaliseBranchNameMock,
  };
}

afterEach(() => {
  __setBranchNameTestOverrides();
  mock.restoreAll();
});

describe('createBranchNameGenerator', () => {
  it('generates normalised branch names using codex by default', async () => {
    const harness = setupHarness();

    harness.enqueueScenario((child) => {
      queueMicrotask(() => {
        child.stdout.emit('data', 'Feature/Add Amazing Thing\nSecond line that should be ignored');
        child.emit('close', 0, null);
      });
    });

    const generator = createBranchNameGenerator();
    const result = await generator.generateBranchName({ prompt: 'Add amazing thing', org: 'vultuk', repo: 'agentrix' });

    assert.equal(result, 'feature/add-amazing-thing');
    assert.equal(harness.loadDeveloperMessageMock.mock.calls[0]?.arguments[0], 'branch-name');
    assert.match(harness.spawnCalls[0]?.command ?? '', /command codex/);
    assert.match(harness.spawnCalls[0]?.command ?? '', /--skip-git-repo-check/);
  });

  it('supports overriding llm selection and custom normalisation', async () => {
    const harness = setupHarness();

    harness.normaliseBranchNameMock.mock.mockImplementation((value: string) => `normal-${value}`);

    harness.enqueueScenario((child) => {
      queueMicrotask(() => {
        child.stdout.emit('data', 'fix/address issue');
        child.emit('close', 0, null);
      });
    });

    const generator = createBranchNameGenerator({ defaultLlm: 'claude' });
    const result = await generator.generateBranchName({ llm: 'cursor', prompt: 'Address issue' });

    assert.equal(result, 'normal-fix/address-issue');
    assert.match(harness.spawnCalls[0]?.command ?? '', /command cursor/);
    assert.match(harness.spawnCalls[0]?.command ?? '', /'-p'/);

    harness.enqueueScenario((child) => {
      queueMicrotask(() => {
        child.stdout.emit('data', 'Enhancement/Add metrics');
        child.emit('close', 0, null);
      });
    });

    const second = await generator.generateBranchName({ llm: 'unknown', prompt: 'Add metrics' });
    assert.equal(second, 'normal-enhancement/add-metrics');
    assert.match(harness.spawnCalls[1]?.command ?? '', /command codex/);
  });

  it('throws when generated branch is empty or invalid', async () => {
    const harness = setupHarness();

    harness.enqueueScenario((child) => {
      queueMicrotask(() => {
        child.emit('close', 0, null);
      });
    });

    const generator = createBranchNameGenerator();

    const emptyError = await generator.generateBranchName().catch((error: unknown) => error);
    assert.ok(emptyError instanceof Error, 'expected error for empty branch name');
    assert.match((emptyError as Error).message, /Failed to generate branch name using codex: Generated branch name was empty/);

    harness.normaliseBranchNameMock.mock.mockImplementationOnce((value: string) => (value === 'main/main' ? 'main' : value));
    harness.enqueueScenario((child) => {
      queueMicrotask(() => {
        child.stdout.emit('data', 'main');
        child.emit('close', 0, null);
      });
    });

    const mainError = await generator.generateBranchName().catch((error: unknown) => error);
    assert.ok(mainError instanceof Error, 'expected error for main branch name');
    assert.match((mainError as Error).message, /Failed to generate branch name using codex: Generated branch name is invalid/);
  });

  it('wraps underlying command failures with descriptive errors', async () => {
    const harness = setupHarness();

    harness.enqueueScenario((child) => {
      queueMicrotask(() => {
        child.stderr.emit('data', 'command failed');
        child.emit('close', 1, null);
      });
    });

    const generator = createBranchNameGenerator();

    await assert.rejects(
      generator.generateBranchName({ prompt: 'something' }),
      /Failed to generate branch name using codex: command failed/,
    );
  });
});
