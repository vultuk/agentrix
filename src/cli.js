#!/usr/bin/env node

const path = require('path');
const { startServer, DEFAULT_HOST, DEFAULT_PORT } = require('./server');

function printHelp() {
  const helpText = `Usage: terminal-worktree [options]

Options:
  -p, --port <number>    Port to bind the HTTP server (default: ${DEFAULT_PORT})
  -H, --host <host>      Host interface to bind (default: ${DEFAULT_HOST})
  -u, --ui <path>        Path to the UI HTML file (default: ui.sample.html)
  -w, --workdir <path>   Working directory root (default: current directory)
  -h, --help             Display this help message
  -v, --version          Output the version number
`;
  process.stdout.write(helpText);
}

function parseArgs(argv) {
  const args = {
    port: DEFAULT_PORT,
    host: DEFAULT_HOST,
    ui: 'ui.sample.html',
    workdir: null,
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
    const pkg = require('../package.json');
    process.stdout.write(`${pkg.version}\n`);
    return;
  }

  const uiPath = path.resolve(process.cwd(), args.ui);
  const workingDir = args.workdir
    ? path.resolve(process.cwd(), args.workdir)
    : process.cwd();

  try {
    const { server, host, port, uiPath: resolvedUi, close } = await startServer({
      uiPath,
      port: args.port,
      host: args.host,
      workdir: workingDir,
    });

    const localAddress = host === '0.0.0.0' ? 'localhost' : host;
    process.stdout.write(`Serving UI from ${resolvedUi}\n`);
    process.stdout.write(`Working directory set to ${workingDir}\n`);
    process.stdout.write(`Listening on http://${localAddress}:${port}\n`);

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

module.exports = { main, parseArgs };
