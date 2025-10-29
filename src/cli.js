#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startServer,
  DEFAULT_HOST,
  DEFAULT_PORT,
  generateRandomPassword,
} from './server/index.js';

const BUNDLED_UI_PATH = fileURLToPath(new URL('../ui/dist', import.meta.url));
const CONFIG_DIR_NAME = '.terminal-worktree';
const CONFIG_FILE_NAME = 'config.json';

function warnConfig(message) {
  process.stderr.write(`[terminal-worktree] ${message}\n`);
}

function getConfigFilePath() {
  const homeDir = os.homedir();
  if (!homeDir) {
    return null;
  }
  return path.join(homeDir, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

function coercePort(value, name, configPath) {
  if (value === undefined || value === null) {
    return undefined;
  }

  let portValue = value;
  if (typeof portValue === 'string') {
    const trimmed = portValue.trim();
    if (!trimmed) {
      warnConfig(`Ignoring empty ${name} in ${configPath || 'config'}`);
      return undefined;
    }
    const parsed = Number.parseInt(trimmed, 10);
    portValue = parsed;
  }

  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
    warnConfig(`Ignoring invalid ${name} in ${configPath || 'config'}; expected port between 1-65535.`);
    return undefined;
  }

  return portValue;
}

function coerceString(value, name, configPath) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    warnConfig(`Ignoring non-string ${name} in ${configPath || 'config'}.`);
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    warnConfig(`Ignoring empty ${name} in ${configPath || 'config'}.`);
    return undefined;
  }

  return trimmed;
}

function pickString(sources, configPath) {
  for (const { value, name } of sources) {
    if (value === undefined || value === null) {
      continue;
    }
    const coerced = coerceString(value, name, configPath);
    if (coerced !== undefined) {
      return coerced;
    }
  }
  return undefined;
}

function normalizeConfig(rawConfig, configPath) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    if (rawConfig !== undefined) {
      warnConfig(`Ignoring config at ${configPath || 'config'} because it is not a JSON object.`);
    }
    return {};
  }

  const normalized = {};
  const commands =
    rawConfig.commands && typeof rawConfig.commands === 'object'
      ? rawConfig.commands
      : null;
  const openai =
    rawConfig.openai && typeof rawConfig.openai === 'object'
      ? rawConfig.openai
      : null;
  const automation =
    rawConfig.automation && typeof rawConfig.automation === 'object'
      ? rawConfig.automation
      : null;
  const ngrok =
    rawConfig.ngrok && typeof rawConfig.ngrok === 'object'
      ? rawConfig.ngrok
      : null;

  const port = coercePort(rawConfig.port, 'port', configPath);
  if (port !== undefined) {
    normalized.port = port;
  }

  const host = coerceString(rawConfig.host, 'host', configPath);
  if (host !== undefined) {
    normalized.host = host;
  }

  const ui = pickString(
    [
      { value: rawConfig.ui, name: 'ui' },
      { value: rawConfig.uiPath, name: 'uiPath' },
    ],
    configPath,
  );
  if (ui !== undefined) {
    normalized.ui = ui;
  }

  const workdir = pickString(
    [
      { value: rawConfig.workdir, name: 'workdir' },
      { value: rawConfig.workDir, name: 'workDir' },
    ],
    configPath,
  );
  if (workdir !== undefined) {
    normalized.workdir = workdir;
  }

  const password = coerceString(rawConfig.password, 'password', configPath);
  if (password !== undefined) {
    normalized.password = password;
  }

  const codexCommand = pickString(
    [
      { value: rawConfig.codexCommand, name: 'codexCommand' },
      { value: commands?.codex, name: 'commands.codex' },
    ],
    configPath,
  );
  if (codexCommand !== undefined) {
    normalized.codexCommand = codexCommand;
  }

  const claudeCommand = pickString(
    [
      { value: rawConfig.claudeCommand, name: 'claudeCommand' },
      { value: commands?.claude, name: 'commands.claude' },
    ],
    configPath,
  );
  if (claudeCommand !== undefined) {
    normalized.claudeCommand = claudeCommand;
  }

  const cursorCommand = pickString(
    [
      { value: rawConfig.cursorCommand, name: 'cursorCommand' },
      { value: commands?.cursor, name: 'commands.cursor' },
    ],
    configPath,
  );
  if (cursorCommand !== undefined) {
    normalized.cursorCommand = cursorCommand;
  }

  const ideCommand = pickString(
    [
      { value: rawConfig.ideCommand, name: 'ideCommand' },
      { value: commands?.ide, name: 'commands.ide' },
    ],
    configPath,
  );
  if (ideCommand !== undefined) {
    normalized.ideCommand = ideCommand;
  }

  const vscodeCommand = pickString(
    [
      { value: rawConfig.vscodeCommand, name: 'vscodeCommand' },
      { value: commands?.vscode, name: 'commands.vscode' },
    ],
    configPath,
  );
  if (vscodeCommand !== undefined) {
    normalized.vscodeCommand = vscodeCommand;
  }

  const ngrokApiKey = pickString(
    [
      { value: rawConfig.ngrokApiKey, name: 'ngrokApiKey' },
      { value: ngrok?.apiKey, name: 'ngrok.apiKey' },
      { value: ngrok?.authtoken, name: 'ngrok.authtoken' },
      { value: ngrok?.token, name: 'ngrok.token' },
    ],
    configPath,
  );
  if (ngrokApiKey !== undefined) {
    normalized.ngrokApiKey = ngrokApiKey;
  }

  const ngrokDomain = pickString(
    [
      { value: rawConfig.ngrokDomain, name: 'ngrokDomain' },
      { value: ngrok?.domain, name: 'ngrok.domain' },
    ],
    configPath,
  );
  if (ngrokDomain !== undefined) {
    normalized.ngrokDomain = ngrokDomain;
  }

  const automationApiKey = pickString(
    [
      { value: rawConfig.automationApiKey, name: 'automationApiKey' },
      { value: rawConfig.apiKey, name: 'apiKey' },
      { value: automation?.apiKey, name: 'automation.apiKey' },
    ],
    configPath,
  );
  if (automationApiKey !== undefined) {
    normalized.automationApiKey = automationApiKey;
  }

  const openaiApiKey = pickString(
    [
      { value: rawConfig.openaiApiKey, name: 'openaiApiKey' },
      { value: openai?.apiKey, name: 'openai.apiKey' },
    ],
    configPath,
  );
  if (openaiApiKey !== undefined) {
    normalized.openaiApiKey = openaiApiKey;
  }

  return normalized;
}

async function loadConfig() {
  const configPath = getConfigFilePath();
  if (!configPath) {
    return { values: {}, path: null };
  }

  let raw;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return { values: {}, path: configPath };
    }
    warnConfig(`Failed to read config at ${configPath}: ${error.message}`);
    return { values: {}, path: configPath };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    warnConfig(`Failed to parse config at ${configPath}: ${error.message}`);
    return { values: {}, path: configPath };
  }

  return { values: normalizeConfig(parsed, configPath), path: configPath };
}

async function saveConfigFile(configValues) {
  const configPath = getConfigFilePath();
  if (!configPath) {
    throw new Error('Unable to resolve config file path (home directory not found).');
  }

  const dir = path.dirname(configPath);
  await fs.mkdir(dir, { recursive: true });

  const serialized = `${JSON.stringify(configValues, null, 2)}\n`;
  await fs.writeFile(configPath, serialized, 'utf8');
  return configPath;
}

function printHelp() {
  const helpText = `Usage: terminal-worktree [options]

Options:
  -p, --port <number>    Port to bind the HTTP server (default: ${DEFAULT_PORT})
  -H, --host <host>      Host interface to bind (default: ${DEFAULT_HOST})
  -u, --ui <path>        Path to the UI directory or entry file (default: bundled build)
  -w, --workdir <path>   Working directory root (default: current directory)
  -P, --password <string>  Password for login (default: randomly generated)
      --codex-command <cmd>   Command executed when launching Codex (default: codex)
      --claude-command <cmd>  Command executed when launching Claude (default: claude)
      --cursor-command <cmd>  Command executed when launching Cursor (default: cursor-agent)
      --ide-command <cmd>     (deprecated) Alias for --cursor-command
      --vscode-command <cmd>  Command executed when launching VS Code (default: code .)
      --ngrok-api-key <token> Authtoken used when establishing an ngrok tunnel
      --ngrok-domain <domain> Reserved ngrok domain to expose the server publicly
      --openai-api-key <token> OpenAI API key used for automatic branch naming
      --save               Persist the effective configuration and exit
  -h, --help             Display this help message
  -v, --version          Output the version number
`;
  process.stdout.write(helpText);
}

function parseArgs(argv) {
  const provided = {
    port: false,
    host: false,
    ui: false,
    workdir: false,
    password: false,
    codexCommand: false,
    claudeCommand: false,
    cursorCommand: false,
    ideCommand: false,
    vscodeCommand: false,
    ngrokApiKey: false,
    ngrokDomain: false,
    openaiApiKey: false,
    save: false,
  };

  const args = {
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
    ui: null,
    workdir: null,
    password: null,
    codexCommand: null,
    claudeCommand: null,
    cursorCommand: null,
    ideCommand: null,
    vscodeCommand: null,
    ngrokApiKey: null,
    ngrokDomain: null,
    openaiApiKey: null,
    save: false,
    help: false,
    version: false,
  };

  Object.defineProperty(args, '_provided', {
    value: provided,
    enumerable: false,
  });

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    switch (token) {
      case '--port':
      case '-p': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected port value after ${token}`);
        }
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
          throw new Error(`Invalid port: ${value}`);
        }
        args.port = parsed;
        provided.port = true;
        break;
      }
      case '--host':
      case '-H': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected host value after ${token}`);
        }
        args.host = value;
        provided.host = true;
        break;
      }
      case '--ui':
      case '-u': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected path value after ${token}`);
        }
        args.ui = value;
        provided.ui = true;
        break;
      }
      case '--workdir':
      case '-w': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected path value after ${token}`);
        }
        args.workdir = value;
        provided.workdir = true;
        break;
      }
      case '--password':
      case '-P': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected password value after ${token}`);
        }
        const trimmed = value.trim();
        if (!trimmed) {
          throw new Error('Password cannot be empty');
        }
        args.password = trimmed;
        provided.password = true;
        break;
      }
      case '--codex-command': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected command value after ${token}`);
        }
        args.codexCommand = value;
        provided.codexCommand = true;
        break;
      }
      case '--claude-command': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected command value after ${token}`);
        }
        args.claudeCommand = value;
        provided.claudeCommand = true;
        break;
      }
      case '--cursor-command': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected command value after ${token}`);
        }
        args.cursorCommand = value;
        provided.cursorCommand = true;
        break;
      }
      case '--ide-command': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected command value after ${token}`);
        }
        args.ideCommand = value;
        provided.ideCommand = true;
        break;
      }
      case '--vscode-command': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected command value after ${token}`);
        }
        args.vscodeCommand = value;
        provided.vscodeCommand = true;
        break;
      }
      case '--ngrok-api-key': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected ngrok API key after ${token}`);
        }
        const trimmed = value.trim();
        if (!trimmed) {
          throw new Error('ngrok API key cannot be empty');
        }
        args.ngrokApiKey = trimmed;
        provided.ngrokApiKey = true;
        break;
      }
      case '--ngrok-domain': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected domain value after ${token}`);
        }
        const trimmed = value.trim();
        if (!trimmed) {
          throw new Error('ngrok domain cannot be empty');
        }
        args.ngrokDomain = trimmed;
        provided.ngrokDomain = true;
        break;
      }
      case '--openai-api-key': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected OpenAI API key after ${token}`);
        }
        const trimmed = value.trim();
        if (!trimmed) {
          throw new Error('OpenAI API key cannot be empty');
        }
        args.openaiApiKey = trimmed;
        provided.openaiApiKey = true;
        break;
      }
      case '--save': {
        args.save = true;
        provided.save = true;
        break;
      }
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--version':
      case '-v':
        args.version = true;
        break;
      default:
        if (token.startsWith('-')) {
          throw new Error(`Unknown option: ${token}`);
        } else {
          throw new Error(`Unexpected argument: ${token}`);
        }
    }
  }

  return args;
}

async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.stderr.write('Use --help to see usage.\n');
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    printHelp();
    return;
  }

  if (args.version) {
    const pkg = await import('../package.json', { with: { type: 'json' } });
    process.stdout.write(`${pkg.default.version}\n`);
    return;
  }

  const { values: fileConfig } = await loadConfig();
  const provided = args._provided;

  const finalPort = provided.port ? args.port : fileConfig.port ?? DEFAULT_PORT;
  const finalHost = provided.host ? args.host : fileConfig.host ?? DEFAULT_HOST;
  const finalUi = provided.ui ? args.ui : fileConfig.ui ?? null;
  const finalWorkdir = provided.workdir ? args.workdir : fileConfig.workdir ?? null;
  const finalPassword = provided.password ? args.password : fileConfig.password ?? null;

  const finalCodexCommand = provided.codexCommand
    ? args.codexCommand
    : fileConfig.codexCommand ?? null;
  const finalClaudeCommand = provided.claudeCommand
    ? args.claudeCommand
    : fileConfig.claudeCommand ?? null;
  const finalIdeCommand = provided.ideCommand
    ? args.ideCommand
    : fileConfig.ideCommand ?? null;
  const finalCursorCommand = provided.cursorCommand
    ? args.cursorCommand
    : provided.ideCommand
      ? args.ideCommand
      : fileConfig.cursorCommand ?? fileConfig.ideCommand ?? null;
  const finalVscodeCommand = provided.vscodeCommand
    ? args.vscodeCommand
    : fileConfig.vscodeCommand ?? null;

  const finalNgrokApiKey = provided.ngrokApiKey
    ? args.ngrokApiKey
    : fileConfig.ngrokApiKey ?? null;
  const finalNgrokDomain = provided.ngrokDomain
    ? args.ngrokDomain
    : fileConfig.ngrokDomain ?? null;
  const finalAutomationApiKey = fileConfig.automationApiKey ?? null;
  const finalOpenAiApiKey = provided.openaiApiKey
    ? args.openaiApiKey
    : fileConfig.openaiApiKey ?? null;

  if ((finalNgrokApiKey && !finalNgrokDomain) || (finalNgrokDomain && !finalNgrokApiKey)) {
    process.stderr.write(
      'Both --ngrok-api-key and --ngrok-domain must be provided together.\n',
    );
    process.exitCode = 1;
    return;
  }

  const workdirInput = finalWorkdir ?? null;
  const workingDir = workdirInput
    ? path.resolve(process.cwd(), workdirInput)
    : process.cwd();
  const uiInput = finalUi ?? null;
  const resolvedUiPath = uiInput
    ? path.resolve(process.cwd(), uiInput)
    : BUNDLED_UI_PATH;
  const chosenPassword = finalPassword || generateRandomPassword();
  const commandOverrides = {
    codex: finalCodexCommand,
    claude: finalClaudeCommand,
    cursor: finalCursorCommand ?? finalIdeCommand,
    ide: finalIdeCommand,
    vscode: finalVscodeCommand,
  };
  const ngrokOptions =
    finalNgrokApiKey && finalNgrokDomain
      ? { apiKey: finalNgrokApiKey, domain: finalNgrokDomain }
      : undefined;

  if (args.save) {
    const configToSave = {
      port: finalPort,
      host: finalHost,
    };

    if (uiInput) {
      configToSave.ui = uiInput;
    }
    if (workdirInput) {
      configToSave.workdir = workdirInput;
    }
    if (finalPassword) {
      configToSave.password = finalPassword;
    }

    const commandsConfig = {};
    if (finalCodexCommand) {
      commandsConfig.codex = finalCodexCommand;
    }
    if (finalClaudeCommand) {
      commandsConfig.claude = finalClaudeCommand;
    }
    if (finalCursorCommand) {
      commandsConfig.cursor = finalCursorCommand;
    }
    if (finalIdeCommand) {
      commandsConfig.ide = finalIdeCommand;
    }
    if (finalVscodeCommand) {
      commandsConfig.vscode = finalVscodeCommand;
    }
    if (Object.keys(commandsConfig).length > 0) {
      configToSave.commands = commandsConfig;
    }

    if (finalNgrokApiKey && finalNgrokDomain) {
      configToSave.ngrok = {
        apiKey: finalNgrokApiKey,
        domain: finalNgrokDomain,
      };
    }

    if (finalAutomationApiKey) {
      configToSave.automation = {
        apiKey: finalAutomationApiKey,
      };
    }

    if (finalOpenAiApiKey) {
      configToSave.openaiApiKey = finalOpenAiApiKey;
    }

    try {
      const savedPath = await saveConfigFile(configToSave);
      process.stdout.write(`Config saved to ${savedPath}\n`);
    } catch (error) {
      process.stderr.write(`Failed to save config: ${error.message}\n`);
      process.exitCode = 1;
    }
    return;
  }

  try {
    const {
      server,
      host,
      port,
      uiPath: resolvedUi,
      close,
      password: serverPassword,
      publicUrl,
    } = await startServer({
      uiPath: resolvedUiPath,
      port: finalPort,
      host: finalHost,
      workdir: workingDir,
      password: chosenPassword,
      commandOverrides,
      ngrok: ngrokOptions,
      automationApiKey: finalAutomationApiKey,
      openaiApiKey: finalOpenAiApiKey ?? undefined,
    });

    const localAddress = host === '0.0.0.0' ? 'localhost' : host;
    process.stdout.write(`Serving UI from ${resolvedUi}\n`);
    process.stdout.write(`Working directory set to ${workingDir}\n`);
    process.stdout.write(`Listening on http://${localAddress}:${port}\n`);
    process.stdout.write(`Password: ${serverPassword || chosenPassword}\n`);
    if (publicUrl) {
      process.stdout.write(`Public URL (ngrok): ${publicUrl}\n`);
    }

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
  } catch (err) {
    process.stderr.write(`Failed to start server: ${err.message}\n`);
    process.exitCode = 1;
  }
}

export { main, parseArgs };
