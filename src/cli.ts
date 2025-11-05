#!/usr/bin/env node

import { parseArgs } from './cli/arg-parser.js';
import { loadConfig, saveConfig } from './cli/config.js';
import { resolveConfig, validateNgrokConfig, buildConfigToSave } from './cli/config-resolver.js';
import { printHelp, printVersion } from './cli/help.js';
import { handlePlansCommand } from './cli/plans-command.js';
import { startAppServer } from './cli/server-starter.js';

async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  // Handle plans subcommand
  if (argv[0] === 'plans') {
    await handlePlansCommand(argv.slice(1));
    return;
  }

  // Parse CLI arguments
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    const error = err as { message?: string };
    process.stderr.write(`${error?.message || String(err)}\n`);
    process.stderr.write('Use --help to see usage.\n');
    process.exitCode = 1;
    return;
  }

  // Handle help and version flags
  if (args.help) {
    printHelp();
    return;
  }

  if (args.version) {
    await printVersion();
    return;
  }

  // Load and merge configuration
  const { values: fileConfig } = await loadConfig();
  const config = resolveConfig(args, fileConfig);

  // Validate configuration
  try {
    validateNgrokConfig(config);
  } catch (err) {
    const error = err as { message?: string };
    process.stderr.write(`${error?.message || String(err)}\n`);
    process.exitCode = 1;
    return;
  }

  // Handle save command
  if (args.save) {
    const configToSave = buildConfigToSave(config, args, fileConfig);
    try {
      const savedPath = await saveConfig(configToSave);
      process.stdout.write(`Config saved to ${savedPath}\n`);
    } catch (error) {
      const err = error as { message?: string };
      process.stderr.write(`Failed to save config: ${err?.message || String(error)}\n`);
      process.exitCode = 1;
    }
    return;
  }

  // Start the server
  try {
    await startAppServer(config);
  } catch (err) {
    const error = err as { message?: string };
    process.stderr.write(`Failed to start server: ${error?.message || String(err)}\n`);
    process.exitCode = 1;
  }
}

export { main, parseArgs };
