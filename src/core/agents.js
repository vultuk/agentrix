import { getOrCreateTerminalSession, queueSessionInput } from './terminal-sessions.js';
import { runTmux } from './tmux.js';

function normaliseTerminalInput(value) {
  if (!value) {
    return '';
  }
  const normalised = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r');
  return /\r$/.test(normalised) ? normalised : `${normalised}\r`;
}

function shellQuote(value) {
  if (value === undefined || value === null) {
    return "''";
  }
  const text = String(value);
  if (text === '') {
    return "''";
  }
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

async function preparePromptEnvironment(session, prompt) {
  const value = typeof prompt === 'string' ? prompt : '';
  if (session?.usingTmux && session.tmuxSessionName) {
    const target = `=${session.tmuxSessionName}`;
    try {
      if (value) {
        await runTmux(['set-environment', '-t', target, 'TERMINAL_WORKTREE_PROMPT', value]);
      } else {
        await runTmux(['set-environment', '-u', '-t', target, 'TERMINAL_WORKTREE_PROMPT']);
      }
      return null;
    } catch (error) {
      console.warn(
        '[terminal-worktree] Failed to set tmux environment variable:',
        error?.message || error,
      );
    }
  }

  if (!value) {
    return 'unset TERMINAL_WORKTREE_PROMPT';
  }
  return `export TERMINAL_WORKTREE_PROMPT=${shellQuote(value)}`;
}

/**
 * Launches an automation agent command inside the managed terminal session for a worktree.
 * Commands run inside the same tmux-backed terminal infrastructure used by the UI so that
 * automation launches remain observable and attachable from the frontend.
 */
export async function launchAgentProcess({ command, workdir, org, repo, branch, prompt }) {
  if (!command || typeof command !== 'string' || !command.trim()) {
    throw new Error('Agent command is required');
  }
  if (!workdir || !org || !repo || !branch) {
    throw new Error('workdir, org, repo, and branch are required to launch an agent');
  }

  const executable = command.trim();
  const promptValue = typeof prompt === 'string' ? prompt : '';
  const { session, created } = await getOrCreateTerminalSession(workdir, org, repo, branch);

  const envPreparation = await preparePromptEnvironment(session, promptValue);
  if (envPreparation) {
    const envInput = normaliseTerminalInput(envPreparation);
    if (envInput) {
      queueSessionInput(session, envInput);
    }
  }

  const commandWithPrompt = promptValue.length > 0
    ? `${executable} ${shellQuote(promptValue)}`
    : executable;

  queueSessionInput(session, normaliseTerminalInput(commandWithPrompt));

  const pid = session?.process?.pid ?? null;
  return {
    pid,
    command: executable,
    sessionId: session.id,
    tmuxSessionName: session.tmuxSessionName ?? null,
    usingTmux: Boolean(session.usingTmux),
    createdSession: created,
  };
}
