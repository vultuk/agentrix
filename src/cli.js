#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startServer,
  DEFAULT_HOST,
  DEFAULT_PORT,
  generateRandomPassword,
} from './server/index.js';

const BUNDLED_UI_PATH = fileURLToPath(new URL('../ui/dist', import.meta.url));

function printHelp() {
  const helpText = `Usage: terminal-worktree [options]

Options:
  -p, --port <number>    Port to bind the HTTP server (default: ${DEFAULT_PORT})
  -H, --host <host>      Host interface to bind (default: ${DEFAULT_HOST})
  -u, --ui <path>        Path to the UI directory or entry file (default: bundled build)
  -w, --workdir <path>   Working directory root (default: current directory)
  -P, --password <string>  Password for login (default: randomly generated)
  -h, --help             Display this help message
  -v, --version          Output the version number
`;
  process.stdout.write(helpText);
}

function parseArgs(argv) {
  const args = {
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
    ui: null,
    workdir: null,
    password: null,
    help: false,
    version: false,
  };

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
        break;
      }
      case '--host':
      case '-H': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected host value after ${token}`);
        }
        args.host = value;
        break;
      }
      case '--ui':
      case '-u': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected path value after ${token}`);
        }
        args.ui = value;
        break;
      }
      case '--workdir':
      case '-w': {
        const value = argv[++i];
        if (!value) {
          throw new Error(`Expected path value after ${token}`);
        }
        args.workdir = value;
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

  const workingDir = args.workdir
    ? path.resolve(process.cwd(), args.workdir)
    : process.cwd();
  const chosenPassword = args.password || generateRandomPassword();
  const resolvedUiPath = args.ui
    ? path.resolve(process.cwd(), args.ui)
    : BUNDLED_UI_PATH;

  try {
    const { server, host, port, uiPath: resolvedUi, close, password: serverPassword } = await startServer({
      uiPath: resolvedUiPath,
      port: args.port,
      host: args.host,
      workdir: workingDir,
      password: chosenPassword,
    });

    const localAddress = host === '0.0.0.0' ? 'localhost' : host;
    process.stdout.write(`Serving UI from ${resolvedUi}\n`);
    process.stdout.write(`Working directory set to ${workingDir}\n`);
    process.stdout.write(`Listening on http://${localAddress}:${port}\n`);
    process.stdout.write(`Password: ${serverPassword || chosenPassword}\n`);

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
