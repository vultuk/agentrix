import { startServer, generateRandomPassword } from '../server/index.js';

interface ServerConfig {
  uiPath: string;
  port: number;
  host: string;
  workdir: string;
  password: string | null;
  showPassword: boolean;
  defaultBranch: string | null;
  defaultBranches: Record<string, string> | null;
  cookieSecure: string;
  codexCommand: string | null;
  claudeCommand: string | null;
  cursorCommand: string | null;
  ideCommand: string | null;
  vscodeCommand: string | null;
  ngrokApiKey: string | null;
  ngrokDomain: string | null;
  automationApiKey: string | null;
  openaiApiKey: string | null;
  branchNameLlm: string | null;
  planLlm: string | null;
  terminalSessionMode: string;
}

export async function startAppServer(config: ServerConfig): Promise<void> {
  const chosenPassword = config.password || generateRandomPassword();
  const passwordWasProvided = config.password !== null;
  const shouldPrintPassword = config.showPassword || !passwordWasProvided;

  const commandOverrides = {
    codex: config.codexCommand,
    claude: config.claudeCommand,
    cursor: config.cursorCommand ?? config.ideCommand,
    ide: config.ideCommand,
    vscode: config.vscodeCommand,
  };

  const ngrokOptions =
    config.ngrokApiKey && config.ngrokDomain
      ? { apiKey: config.ngrokApiKey, domain: config.ngrokDomain }
      : undefined;

  const hasDefaultBranchConfig = Boolean(config.defaultBranch) || Boolean(config.defaultBranches);
  const defaultBranchConfig = hasDefaultBranchConfig
    ? {
        global: config.defaultBranch ?? undefined,
        overrides: config.defaultBranches || undefined,
      }
    : undefined;

  const {
    server: _server,
    host,
    port,
    uiPath: resolvedUi,
    close,
    password: serverPassword,
    publicUrl,
  } = await startServer({
    uiPath: config.uiPath,
    port: config.port,
    host: config.host,
    workdir: config.workdir,
    password: chosenPassword,
    commandOverrides: commandOverrides as never,
    ngrok: ngrokOptions as never,
    automationApiKey: (config.automationApiKey ?? undefined) as string | undefined,
    openaiApiKey: (config.openaiApiKey ?? undefined) as string | undefined,
    branchNameLlm: (config.branchNameLlm ?? undefined) as string | undefined,
    planLlm: (config.planLlm ?? undefined) as string | undefined,
    defaultBranches: defaultBranchConfig as never,
    cookieSecure: (config.cookieSecure ?? undefined) as string | boolean | undefined,
    terminalSessionMode: (config.terminalSessionMode ?? undefined) as 'auto' | 'tmux' | 'pty' | undefined,
  });

  const localAddress = host === '0.0.0.0' ? 'localhost' : host;
  process.stdout.write(`Serving UI from ${resolvedUi}\n`);
  process.stdout.write(`Working directory set to ${config.workdir}\n`);
  process.stdout.write(`Listening on http://${localAddress}:${port}\n`);

  const effectivePassword = serverPassword || chosenPassword;
  if (shouldPrintPassword) {
    process.stdout.write(`Password: ${effectivePassword}\n`);
  } else {
    process.stdout.write(
      'Password logging suppressed (operator-provided password). Use --show-password to print.\n',
    );
  }

  if (publicUrl) {
    process.stdout.write(`Public URL (ngrok): ${publicUrl}\n`);
  }

  setupShutdownHandlers(close);
}

function setupShutdownHandlers(close: () => Promise<void>): void {
  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    process.stdout.write('\nShutting down...\n');
    close()
      .catch((error) => {
        process.stderr.write(`Error during shutdown: ${error.message}\n`);
      })
      .finally(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}


