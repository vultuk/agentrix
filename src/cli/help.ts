import { DEFAULT_HOST, DEFAULT_PORT } from '../server/index.js';

export function printHelp(): void {
  const helpText = `Usage: agentrix [options]

Options:
  -p, --port <number>    Port to bind the HTTP server (default: ${DEFAULT_PORT})
  -H, --host <host>      Host interface to bind (default: ${DEFAULT_HOST})
  -u, --ui <path>        Path to the UI directory or entry file (default: bundled build)
  -w, --workdir <path>   Working directory root (default: current directory)
  -P, --password <string>  Password for login (default: randomly generated)
      --default-branch <name>  Override default branch used when syncing repositories
      --cookie-secure <mode>  Set session cookie security (true, false, auto)
      --terminal-session-mode <mode>  Terminal backend preference: auto, tmux, pty (default: auto)
      --force-tmux         Shortcut for --terminal-session-mode tmux (fail if tmux unavailable)
      --no-tmux            Shortcut for --terminal-session-mode pty (disable tmux usage)
      --show-password     Print the resolved password even if provided via config or flag
      --codex-command <cmd>   Command executed when launching Codex (default: codex)
      --claude-command <cmd>  Command executed when launching Claude (default: claude)
      --cursor-command <cmd>  Command executed when launching Cursor (default: cursor-agent)
      --ide-command <cmd>     (deprecated) Alias for --cursor-command
      --vscode-command <cmd>  Command executed when launching VS Code (default: code .)
      --ngrok-api-key <token> Authtoken used when establishing an ngrok tunnel
      --ngrok-domain <domain> Reserved ngrok domain to expose the server publicly
      --openai-api-key <token> OpenAI API key forwarded to local LLM commands
      --save               Persist the effective configuration and exit
  -h, --help             Display this help message
  -v, --version          Output the version number
`;
  process.stdout.write(helpText);
}

export async function printVersion(): Promise<void> {
  const pkg = await import('../../package.json', { with: { type: 'json' } });
  process.stdout.write(`${pkg.default.version}\n`);
}


