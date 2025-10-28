import { spawn } from 'node:child_process';

/**
 * Launches an automation agent command inside a given working directory.
 * The agent command is executed via the system shell to allow composite
 * commands configured in config.json (e.g. including arguments or env setup).
 *
 * The provided prompt is written to the spawned process stdin and also exposed
 * via the TERMINAL_WORKTREE_PROMPT environment variable for agents that prefer
 * reading prompts from the environment instead of stdin.
 *
 * Resolves once the process has spawned successfully and returns the pid so
 * callers can surface it to clients. Non-zero exit codes are logged but do not
 * reject the original launch request to avoid masking successful spawns that
 * subsequently fail due to downstream tooling.
 */
export async function launchAgentProcess({ command, cwd, prompt }) {
  if (!command || typeof command !== 'string' || !command.trim()) {
    throw new Error('Agent command is required');
  }

  const executable = command.trim();
  const child = spawn(executable, {
    cwd,
    shell: true,
    stdio: ['pipe', 'inherit', 'inherit'],
    env: {
      ...process.env,
      TERMINAL_WORKTREE_PROMPT: typeof prompt === 'string' ? prompt : '',
    },
  });

  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('spawn', resolve);
  });

  if (child.stdin) {
    const input = typeof prompt === 'string' ? prompt : '';
    if (input) {
      child.stdin.write(input);
      if (!/\r?\n$/.test(input)) {
        child.stdin.write('\n');
      }
    }
    child.stdin.end();
  }

  child.once('exit', (code, signal) => {
    if (code !== 0) {
      const reason = signal ? ` (signal ${signal})` : '';
      console.error(
        `[terminal-worktree] Agent command "${executable}" exited with code ${code}${reason}`,
      );
    }
  });

  return { pid: child.pid, command: executable };
}

