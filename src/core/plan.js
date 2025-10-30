import { spawn } from 'node:child_process';
import { loadDeveloperMessage } from '../config/developer-messages.js';

export const DEFAULT_PLAN_DEVELOPER_MESSAGE = `\`\`\`
Transform any user message describing a feature request, enhancement, or bug fix into a structured PTCGO-style prompt for Codex. The resulting prompt should instruct Codex to directly implement the described change in code provided or in the target repository context.

Follow this structure strictly:

Persona: Assume the role of a senior full-stack developer working with modern frameworks. You write clean, maintainable code and follow SOLID, DRY, and YAGNI principles.

Task: Implement the feature request, enhancement, or bug fix described by the user.

Steps to Complete Task:
1. Analyse the user’s description to determine what part of the codebase is affected and what needs to change.
2. If code is provided, use it as the working context. Otherwise, infer where changes belong.
3. Write complete, correct, and self-contained code implementing the change.
4. Include inline documentation and clear commit-style explanations if relevant.

Context / Constraints:
- Do not add boilerplate or unrelated refactors.
- Maintain existing coding conventions, folder structure, and architectural boundaries.
- Use concise, idiomatic, production-grade TypeScript or the language of the provided code.

Goal: Produce the minimal and correct code modification that fulfils the request as described. The result must be ready to paste or commit directly.

Format Output: Provide only the final prompt Codex should act on — no extra commentary or metadata. The output must be plain text starting with 'Implement the following change:' followed by the fully structured Codex instruction.
\`\`\``;

const SUPPORTED_LLMS = new Set(['codex', 'claude', 'cursor']);
const DEFAULT_LLM = 'codex';
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000;
const COMMAND_MAX_BUFFER = 2 * 1024 * 1024;

const COMMAND_NAMES = {
  codex: 'codex',
  claude: 'claude',
  cursor: 'cursor-agent',
};

function shellQuote(value) {
  const str = String(value ?? '');
  if (str === '') {
    return "''";
  }
  return `'${str.replace(/'/g, `'\\''`)}'`;
}

function buildCommandString(baseCommand, args = []) {
  const trimmedBase =
    typeof baseCommand === 'string' && baseCommand.trim() ? baseCommand.trim() : '';
  if (!trimmedBase) {
    throw new Error('Command is not configured for plan generation.');
  }
  const serializedArgs = args.map((arg) => shellQuote(arg));
  return [trimmedBase, ...serializedArgs].join(' ');
}

function normaliseLlm(input) {
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

function resolveShellInvocation() {
  const shellPath =
    typeof process.env.SHELL === 'string' && process.env.SHELL.trim()
      ? process.env.SHELL.trim()
      : '/bin/sh';
  const name = shellPath.split('/').pop();
  const shellArgs = [];
  if (name === 'bash' || name === 'zsh' || name === 'fish') {
    shellArgs.push('-il');
  }
  shellArgs.push('-c');
  return { shellPath, shellArgs };
}

function buildCommandForLlm(llm, promptText) {
  const baseCommand = COMMAND_NAMES[llm];
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

async function executePlanCommand(command, { cwd, signal, onProcessStart } = {}) {
  const { shellPath, shellArgs } = resolveShellInvocation();
  const resolvedCwd = typeof cwd === 'string' ? cwd.trim() : '';
  const isPosix = process.platform !== 'win32';
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let totalOutput = 0;
    let timedOut = false;
    let aborted = false;
    let killTimer = null;
    let overflowed = false;
    const child = spawn(shellPath, [...shellArgs, command], {
      cwd: resolvedCwd || undefined,
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
          process.kill(-child.pid, code);
        } catch {
          // ignore group kill errors
        }
      }
      if (!child.killed) {
        try {
          child.kill(code);
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

    let abortListener = null;
    if (signal) {
      if (signal.aborted) {
        handleAbort();
      } else {
        abortListener = handleAbort;
        signal.addEventListener('abort', abortListener);
      }
    }

    const timeoutId = COMMAND_TIMEOUT_MS
      ? setTimeout(() => {
          timedOut = true;
          terminateChild();
        }, COMMAND_TIMEOUT_MS)
      : null;
    timeoutId?.unref?.();

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');

    const handleStdout = (chunk) => {
      stdout += chunk;
      totalOutput += Buffer.byteLength(chunk, 'utf8');
      if (totalOutput > COMMAND_MAX_BUFFER) {
        overflowed = true;
        terminateChild();
      }
    };

    const handleStderr = (chunk) => {
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

    const handleError = (error) => {
      cleanup();
      reject(error);
    };

    child.on('error', handleError);

    const handleClose = (code, signalCode) => {
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
      const trimmedStdout = stdout.trim();
      if (trimmedStdout) {
        resolve(trimmedStdout);
        return;
      }
      const trimmedStderr = stderr.trim();
      if (trimmedStderr) {
        resolve(trimmedStderr);
        return;
      }
      resolve(stdout);
    };

    child.once('close', handleClose);
  });
}

function buildPlanPrompt({ developerMessage, userPrompt }) {
  const sections = [];
  const cleanedDeveloper = typeof developerMessage === 'string' ? developerMessage.trim() : '';
  if (cleanedDeveloper) {
    sections.push(cleanedDeveloper);
  }
  const cleanedPrompt = typeof userPrompt === 'string' ? userPrompt.trim() : '';
  if (cleanedPrompt) {
    sections.push(`User Request:\n${cleanedPrompt}`);
  }
  sections.push('Respond with the Codex-ready prompt only.');
  return sections.join('\n\n');
}

export function createPlanService({ defaultLlm, execPlanCommand: customExecutor } = {}) {
  const chosenLlm = normaliseLlm(defaultLlm);
  let developerMessagePromise = null;
  const runPlanCommand =
    typeof customExecutor === 'function' ? customExecutor : executePlanCommand;
  const activeControllers = new Set();
  const runningCommands = new Set();
  const activeProcesses = new Set();

  async function getDeveloperMessage() {
    if (!developerMessagePromise) {
      developerMessagePromise = loadDeveloperMessage(
        'create-plan',
        DEFAULT_PLAN_DEVELOPER_MESSAGE,
      );
    }
    return developerMessagePromise;
  }

  async function generatePlan({ prompt, llm, cwd } = {}) {
    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new Error('prompt is required');
    }

    const developerMessage = await getDeveloperMessage();
    const promptText = buildPlanPrompt({ developerMessage, userPrompt: prompt });
    const requestedLlm = normaliseLlm(llm || chosenLlm);

    const controller = new AbortController();
    activeControllers.add(controller);
    let commandPromise;
    try {
      const command = buildCommandForLlm(requestedLlm, promptText);
      try {
        commandPromise = Promise.resolve(
          runPlanCommand(command, {
            cwd,
            signal: controller.signal,
            onProcessStart: (childProcess) => {
              if (!childProcess) {
                return;
              }
              activeProcesses.add(childProcess);
              childProcess.once('close', () => {
                activeProcesses.delete(childProcess);
              });
            },
          }),
        );
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
          throw new Error('Plan generation was cancelled.');
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
      const plan =
        typeof output === 'string'
          ? output
          : output == null
            ? ''
            : String(output);
      if (!plan.trim()) {
        throw new Error('Generated plan was empty.');
      }
      return plan;
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError' || error?.code === 'ABORT_ERR') {
        throw new Error('Plan generation was cancelled.');
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to generate plan using ${requestedLlm}: ${message}`);
    } finally {
      activeControllers.delete(controller);
    }
  }

  async function disposeAll() {
    if (activeControllers.size === 0 && runningCommands.size === 0 && activeProcesses.size === 0) {
      return;
    }
    const controllers = Array.from(activeControllers);
    controllers.forEach((controller) => {
      try {
        controller.abort();
      } catch {
        // ignore abort errors during disposal
      }
    });
    activeControllers.clear();
    const processes = Array.from(activeProcesses);
    activeProcesses.clear();
    processes.forEach((child) => {
      try {
        if (!child.killed) {
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
            new Promise((resolve) => {
              if (child.exitCode !== null || child.signalCode) {
                resolve();
                return;
              }
              const handleResolve = () => resolve();
              child.once('close', handleResolve);
              child.once('exit', handleResolve);
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
    async createPlanText(options) {
      return generatePlan(options);
    },
    async createPlanStream(options) {
      const plan = await generatePlan(options);
      const chunkSize = 2048;
      async function* iterator() {
        for (let offset = 0; offset < plan.length; offset += chunkSize) {
          yield plan.slice(offset, offset + chunkSize);
        }
      }
      return iterator();
    },
    async dispose() {
      await disposeAll();
    },
  };
}
