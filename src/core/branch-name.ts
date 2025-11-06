import { spawn as childSpawn } from 'node:child_process';
import { loadDeveloperMessage as loadDeveloperMessageImpl } from '../config/developer-messages.js';
import { normaliseBranchName as normaliseBranchNameImpl } from './git.js';

const SUPPORTED_LLMS = new Set(['codex', 'claude', 'cursor']);
const DEFAULT_LLM = 'codex';
const COMMAND_TIMEOUT_MS = 30_000;
const COMMAND_MAX_BUFFER = 512 * 1024;

const DEFAULT_DEVELOPER_MESSAGE =
  'Generate a branch name in the format <type>/<description> with no preamble or postamble, and no code blocks. The <type> must be one of: feature, enhancement, fix, chore, or another appropriate status. The <description> should be concise (max 7 words), using dashes to separate words. Example: feature/create-calendar-page.';

const COMMAND_NAMES = {
  codex: 'codex',
  claude: 'claude',
  cursor: 'cursor-agent',
};

interface BranchNameDependencies {
  spawn: typeof childSpawn;
  loadDeveloperMessage: typeof loadDeveloperMessageImpl;
  normaliseBranchName: typeof normaliseBranchNameImpl;
}

const defaultDependencies: BranchNameDependencies = {
  spawn: childSpawn,
  loadDeveloperMessage: loadDeveloperMessageImpl,
  normaliseBranchName: normaliseBranchNameImpl,
};

let activeDependencies: BranchNameDependencies = { ...defaultDependencies };

export function __setBranchNameTestOverrides(overrides?: Partial<BranchNameDependencies>): void {
  if (!overrides) {
    activeDependencies = { ...defaultDependencies };
    return;
  }
  activeDependencies = { ...activeDependencies, ...overrides };
}

function slugifySegment(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function sanitiseCandidate(rawValue: unknown): string {
  if (typeof rawValue !== 'string') {
    return '';
  }

  const line = rawValue
    .split('\n')
    .map((segment) => segment.trim())
    .find(Boolean);
  if (!line) {
    return '';
  }

  const cleaned = line.replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '').trim();
  if (!cleaned) {
    return '';
  }

  const segments = cleaned.split('/').map((segment) => slugifySegment(segment));

  let type = segments[0];
  const remainder = segments.slice(1).filter(Boolean);

  if (!type) {
    type = 'feature';
  }

  if (remainder.length === 0) {
    const fallback = slugifySegment(cleaned.replace(/\//g, '-'));
    if (!fallback) {
      return '';
    }
    remainder.push(fallback);
  }

  const branch = [type, ...remainder].join('/');
  return activeDependencies.normaliseBranchName(branch);
}

function buildUserPrompt({ prompt, org, repo }: { prompt?: string; org?: string; repo?: string } = {}): string {
  const sections = [];
  if (org && repo) {
    sections.push(`Repository: ${org}/${repo}`);
  }
  if (prompt) {
    sections.push(`Summary:\n${prompt}`);
  }

  if (sections.length === 0) {
    sections.push('Generate a succinct branch name for an upcoming change.');
  }

  return sections.join('\n\n');
}

function shellQuote(value: unknown): string {
  const str = String(value ?? '');
  if (str === '') {
    return "''";
  }
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

function buildCommandString(baseCommand: unknown, args: string[] = []): string {
  const trimmedBase =
    typeof baseCommand === 'string' && baseCommand.trim() ? baseCommand.trim() : '';
  if (!trimmedBase) {
    throw new Error('Command is not configured for branch naming.');
  }
  const serializedArgs = args.map((arg) => shellQuote(arg));
  return [trimmedBase, ...serializedArgs].join(' ');
}

function normaliseLlm(input: unknown): string {
  if (typeof input !== 'string') {
    return DEFAULT_LLM;
  }
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    return DEFAULT_LLM;
  }
  if (!SUPPORTED_LLMS.has(trimmed)) {
    return DEFAULT_LLM;
  }
  return trimmed;
}

function buildPromptText({ developerMessage, userPrompt }: { developerMessage: string; userPrompt: string }): string {
  const sections = [developerMessage.trim()];
  if (userPrompt.trim()) {
    sections.push(userPrompt.trim());
  }
  sections.push('Respond with the branch name only.');
  return sections.join('\n\n');
}

async function executeLlmCommand(
  command: string,
  { signal, onProcessStart }: { signal?: AbortSignal; onProcessStart?: (process: unknown) => void } = {}
): Promise<string> {
  const { shellPath, shellArgs } = resolveShellInvocation();
  const isPosix = process.platform !== 'win32';
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let totalOutput = 0;
    let timedOut = false;
    let aborted = false;
    let killTimer: NodeJS.Timeout | null = null;
    let overflowed = false;
    const child = activeDependencies.spawn(shellPath, [...shellArgs, command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      detached: isPosix,
    });

    if (typeof onProcessStart === 'function') {
      try {
        onProcessStart(child);
      } catch {
        // ignore observer errors
      }
    }

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (killTimer) {
        clearTimeout(killTimer);
      }
      if (abortListener && signal) {
        signal.removeEventListener('abort', abortListener);
      }
      if (child.stdout) {
        child.stdout.off('data', handleStdout);
      }
      if (child.stderr) {
        child.stderr.off('data', handleStderr);
      }
      child.off('error', handleError);
      child.off('close', handleClose);
    };

    const abortError = new Error('Command aborted');
    abortError.name = 'AbortError';

    const terminateChild = (code = 'SIGTERM') => {
      if (isPosix && typeof child.pid === 'number' && child.pid > 0) {
        try {
          process.kill(-child.pid, code as NodeJS.Signals);
        } catch {
          // ignore group kill errors
        }
      }
      if (!child.killed) {
        try {
          child.kill(code as NodeJS.Signals);
        } catch {
          // ignore kill errors
        }
      }
      killTimer = setTimeout(() => {
        if (isPosix && typeof child.pid === 'number' && child.pid > 0) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            // ignore group kill errors
          }
        }
        if (!child.killed) {
          try {
            child.kill('SIGKILL');
          } catch {
            // ignore kill errors
          }
        }
      }, 1000);
      killTimer.unref?.();
    };

    const handleAbort = () => {
      if (aborted) {
        return;
      }
      aborted = true;
      terminateChild();
    };

    let abortListener: (() => void) | null = null;
    if (signal) {
      if (signal.aborted) {
        handleAbort();
      } else {
        abortListener = handleAbort;
        signal.addEventListener('abort', abortListener);
      }
    }

    const timeoutId: NodeJS.Timeout | null = COMMAND_TIMEOUT_MS
      ? setTimeout(() => {
          timedOut = true;
          terminateChild();
        }, COMMAND_TIMEOUT_MS)
      : null;
    timeoutId?.unref?.();

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    const handleStdout = (chunk: Buffer | string): void => {
      stdout += chunk;
      totalOutput += Buffer.byteLength(chunk, 'utf8');
      if (totalOutput > COMMAND_MAX_BUFFER) {
        overflowed = true;
        terminateChild();
      }
    };

    const handleStderr = (chunk: Buffer | string): void => {
      stderr += chunk;
      totalOutput += Buffer.byteLength(chunk, 'utf8');
      if (totalOutput > COMMAND_MAX_BUFFER) {
        overflowed = true;
        terminateChild();
      }
    };

    if (child.stdout) {
      child.stdout.on('data', handleStdout);
    }
    if (child.stderr) {
      child.stderr.on('data', handleStderr);
    }

    const handleError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    child.on('error', handleError);

    const handleClose = (code: number | null, signalCode: NodeJS.Signals | null): void => {
      cleanup();
      if (overflowed) {
        reject(new Error('Command output exceeded maximum buffer size.'));
        return;
      }
      if (aborted) {
        reject(abortError);
        return;
      }
      if (timedOut) {
        reject(new Error('Command timed out.'));
        return;
      }
      if (signalCode) {
        reject(new Error(`Command terminated due to signal ${signalCode}`));
        return;
      }
      if (code !== 0) {
        const message = stderr.trim() || stdout.trim() || `Command exited with code ${code}`;
        reject(new Error(message));
        return;
      }
      resolve(stdout);
    };

    child.once('close', handleClose);
  });
}

function resolveShellInvocation() {
  const shellPath =
    typeof process.env["SHELL"] === 'string' && process.env["SHELL"].trim()
      ? process.env["SHELL"].trim()
      : '/bin/sh';
  const name = shellPath.split('/').pop();
  const shellArgs = [];
  if (name === 'bash' || name === 'zsh' || name === 'fish') {
    shellArgs.push('-il');
  }
  shellArgs.push('-c');
  return { shellPath, shellArgs };
}

function resolveBaseCommand(llm: string): string | null {
  if (llm === 'codex') {
    return COMMAND_NAMES.codex;
  }
  if (llm === 'claude') {
    return COMMAND_NAMES.claude;
  }
  if (llm === 'cursor') {
    return COMMAND_NAMES.cursor;
  }
  return null;
}

function buildCommandForLlm(llm: string, promptText: string): string {
  const baseCommand = resolveBaseCommand(llm);
  if (!baseCommand) {
    throw new Error(`No command configured for LLM "${llm}".`);
  }
  const commandPrefix = `command ${baseCommand}`;

  switch (llm) {
    case 'claude':
      return buildCommandString(commandPrefix, ['-p', promptText]);
    case 'cursor':
      return buildCommandString(commandPrefix, ['-p', promptText]);
    case 'codex':
    default:
      return buildCommandString(commandPrefix, ['exec', promptText, '--skip-git-repo-check']);
  }
}

export function createBranchNameGenerator({ defaultLlm }: { defaultLlm?: string } = {}) {
  const chosenLlm = normaliseLlm(defaultLlm);
  const activeControllers = new Set();
  const runningCommands = new Set();
  const activeProcesses = new Set();

  async function generateBranchName(context: { prompt?: string; org?: string; repo?: string; llm?: string } = {}) {
    const userPrompt = buildUserPrompt(context);
    const developerMessage = await activeDependencies.loadDeveloperMessage('branch-name', DEFAULT_DEVELOPER_MESSAGE);

    const promptText = buildPromptText({ developerMessage, userPrompt });
    const requestedLlm = normaliseLlm(context.llm || chosenLlm);
    const controller = new AbortController();
    activeControllers.add(controller);
    let commandPromise: Promise<string> | undefined;

    try {
      const command = buildCommandForLlm(requestedLlm, promptText);
      try {
        commandPromise = Promise.resolve(
          executeLlmCommand(command, {
            signal: controller.signal,
            onProcessStart: (childProcess) => {
              if (!childProcess) {
                return;
              }
              activeProcesses.add(childProcess);
              const proc = childProcess as { once: (event: string, handler: () => void) => void };
              proc.once('close', () => {
                activeProcesses.delete(childProcess);
              });
            },
          }),
        );
      } catch (error: unknown) {
        const err = error as { name?: string; code?: string };
        if (controller.signal.aborted || err?.name === 'AbortError' || err?.code === 'ABORT_ERR') {
          throw new Error('Branch name generation was cancelled.');
        }
        throw error;
      }
      runningCommands.add(commandPromise);
      let output;
      try {
        output = await commandPromise;
      } finally {
        runningCommands.delete(commandPromise);
      }
      const candidate = sanitiseCandidate(output);
      if (!candidate) {
        throw new Error('Generated branch name was empty.');
      }
      if (candidate.toLowerCase() === 'main') {
        throw new Error('Generated branch name is invalid (branch "main" is not allowed).');
      }
      return candidate;
    } catch (error: unknown) {
      const err = error as { name?: string; code?: string };
      if (controller.signal.aborted || err?.name === 'AbortError' || err?.code === 'ABORT_ERR') {
        throw new Error('Branch name generation was cancelled.');
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to generate branch name using ${requestedLlm}: ${message}`);
    } finally {
      activeControllers.delete(controller);
    }
  }

  async function disposeAll() {
    if (activeControllers.size === 0 && runningCommands.size === 0 && activeProcesses.size === 0) {
      return;
    }
    const controllers = Array.from(activeControllers) as AbortController[];
    controllers.forEach((controller: AbortController) => {
      try {
        controller.abort();
      } catch {
        // ignore abort errors during disposal
      }
    });
    activeControllers.clear();
    const processes = Array.from(activeProcesses) as Array<{
      killed?: boolean;
      exitCode?: number | null;
      signalCode?: string | null;
      kill?: (signal: string) => void;
      once?: (event: string, handler: () => void) => void;
    }>;
    activeProcesses.clear();
    processes.forEach((child) => {
      try {
        if (!child.killed && child.kill) {
          child.kill('SIGTERM');
        }
      } catch {
        // ignore kill errors during disposal
      }
    });
    if (processes.length > 0) {
      await Promise.allSettled(
        processes.map(
          (child) =>
            new Promise<void>((resolve) => {
              if (child.exitCode !== null || child.signalCode) {
                resolve();
                return;
              }
              const handleResolve = () => resolve();
              if (child.once) {
                child.once('close', handleResolve);
                child.once('exit', handleResolve);
              } else {
                resolve();
              }
            }),
        ),
      );
    }
    const pending = Array.from(runningCommands);
    runningCommands.clear();
    if (pending.length > 0) {
      await Promise.allSettled(pending);
    }
  }

  return {
    isConfigured: true,
    generateBranchName,
    async dispose() {
      await disposeAll();
    },
  };
}
