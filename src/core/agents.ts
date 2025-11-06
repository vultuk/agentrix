import { createIsolatedTerminalSession, queueSessionInput } from './terminal-sessions.js';
import type { TerminalSession } from '../types/terminal.js';
import { runTmux } from './tmux.js';
import { savePlanToWorktree } from './plan-storage.js';

type AgentDependencies = {
  createIsolatedTerminalSession: typeof createIsolatedTerminalSession;
  queueSessionInput: typeof queueSessionInput;
  runTmux: typeof runTmux;
  savePlanToWorktree: typeof savePlanToWorktree;
};

const baseDependencies: AgentDependencies = {
  createIsolatedTerminalSession,
  queueSessionInput,
  runTmux,
  savePlanToWorktree,
};

let agentTestOverrides: Partial<AgentDependencies> | null = null;

function resolveDependencies(): AgentDependencies {
  return agentTestOverrides ? { ...baseDependencies, ...agentTestOverrides } : baseDependencies;
}

export function __setAgentsTestOverrides(overrides?: Partial<AgentDependencies>): void {
  agentTestOverrides = overrides ?? null;
}

function normaliseTerminalInput(value: unknown): string {
  if (!value) {
    return '';
  }
  const normalised = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r');
  return /\r$/.test(normalised) ? normalised : `${normalised}\r`;
}

function shellQuote(value: unknown): string {
  if (value === undefined || value === null) {
    return "''";
  }
  const text = String(value);
  if (text === '') {
    return "''";
  }
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

async function preparePromptEnvironment(
  session: TerminalSession,
  prompt: string,
  deps: AgentDependencies,
): Promise<string | null> {
  const value = typeof prompt === 'string' ? prompt : '';
  if (session?.usingTmux && session.tmuxSessionName) {
    const target = `=${session.tmuxSessionName}`;
    try {
      if (value) {
        await deps.runTmux(['set-environment', '-t', target, 'AGENTRIX_PROMPT', value]);
      } else {
        await deps.runTmux(['set-environment', '-u', '-t', target, 'AGENTRIX_PROMPT']);
      }
      return null;
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.warn(
        '[agentrix] Failed to set tmux environment variable:',
        err?.message || error
      );
    }
  }

  if (!value) {
    return 'unset AGENTRIX_PROMPT';
  }
  return `export AGENTRIX_PROMPT=${shellQuote(value)}`;
}

export interface LaunchAgentParams {
  command: string;
  workdir: string;
  org: string;
  repo: string;
  branch: string;
  prompt: string;
}

export interface LaunchAgentResult {
  pid: number | null;
  command: string;
  sessionId: string;
  tmuxSessionName: string | null;
  usingTmux: boolean;
  createdSession: boolean;
}

/**
 * Launches an automation agent command inside the managed terminal session for a worktree.
 * Commands run inside the same tmux-backed terminal infrastructure used by the UI so that
 * automation launches remain observable and attachable from the frontend.
 */
export async function launchAgentProcess({
  command,
  workdir,
  org,
  repo,
  branch,
  prompt,
}: LaunchAgentParams): Promise<LaunchAgentResult> {
  const deps = resolveDependencies();
  if (!command || typeof command !== 'string' || !command.trim()) {
    throw new Error('Agent command is required');
  }
  if (!workdir || !org || !repo || !branch) {
    throw new Error('workdir, org, repo, and branch are required to launch an agent');
  }

  const executable = command.trim();
  const promptValue = typeof prompt === 'string' ? prompt : '';
  const session = await deps.createIsolatedTerminalSession(workdir, org, repo, branch);

  if (session.worktreePath) {
    try {
      await deps.savePlanToWorktree({
        worktreePath: session.worktreePath,
        branch,
        planText: promptValue,
      });
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.warn(
        '[agentrix] Failed to persist automation plan:',
        err?.message || error
      );
    }
  }

  const envPreparation = await preparePromptEnvironment(session, promptValue, deps);
  if (envPreparation) {
    const envInput = normaliseTerminalInput(envPreparation);
    if (envInput) {
      deps.queueSessionInput(session, envInput);
    }
  }

  const commandWithPrompt =
    promptValue.length > 0 ? `${executable} ${shellQuote(promptValue)}` : executable;

  deps.queueSessionInput(session, normaliseTerminalInput(commandWithPrompt));

  const pid = session?.process?.pid ?? null;
  return {
    pid,
    command: executable,
    sessionId: session.id,
    tmuxSessionName: session.tmuxSessionName ?? null,
    usingTmux: Boolean(session.usingTmux),
    createdSession: true,
  };
}
