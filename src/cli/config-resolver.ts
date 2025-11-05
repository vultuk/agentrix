import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_HOST, DEFAULT_PORT } from '../server/index.js';
import type { ParsedArgs } from './types.js';

const BUNDLED_UI_PATH = fileURLToPath(new URL('../../ui/dist', import.meta.url));

interface ResolvedConfig {
  port: number;
  host: string;
  uiPath: string;
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

function resolveValue<T>(
  provided: boolean,
  cliValue: T,
  configValue: T | undefined,
  defaultValue: T,
): T {
  if (provided) {
    return cliValue;
  }
  return configValue ?? defaultValue;
}

export function resolveConfig(
  args: ParsedArgs,
  fileConfig: Record<string, unknown>,
): ResolvedConfig {
  const { _provided: provided } = args;
  const fc = fileConfig;

  const port = resolveValue(provided['port'] ?? false, args.port, fc['port'] as number | undefined, DEFAULT_PORT);
  const host = resolveValue(provided['host'] ?? false, args.host, fc['host'] as string | undefined, DEFAULT_HOST);
  const uiInput = resolveValue(provided['ui'] ?? false, args.ui, fc['ui'] as string | undefined, null);
  const workdirInput = resolveValue(provided['workdir'] ?? false, args.workdir, fc['workdir'] as string | undefined, null);
  const password = resolveValue(provided['password'] ?? false, args.password, fc['password'] as string | undefined, null);
  const defaultBranch = resolveValue(provided['defaultBranch'] ?? false, args.defaultBranch, fc['defaultBranch'] as string | undefined, null);
  const cookieSecure = resolveValue(provided['cookieSecure'] ?? false, args.cookieSecure, fc['cookieSecure'] as string | undefined, 'auto');

  const defaultBranches =
    fc['defaultBranches'] && typeof fc['defaultBranches'] === 'object' && Object.keys(fc['defaultBranches'] as object).length > 0
      ? (fc['defaultBranches'] as Record<string, string>)
      : null;

  const codexCommand = resolveValue(provided['codexCommand'] ?? false, args.codexCommand, fc['codexCommand'] as string | undefined, null);
  const claudeCommand = resolveValue(provided['claudeCommand'] ?? false, args.claudeCommand, fc['claudeCommand'] as string | undefined, null);
  const ideCommand = resolveValue(provided['ideCommand'] ?? false, args.ideCommand, fc['ideCommand'] as string | undefined, null);

  const cursorCommand = (provided['cursorCommand'] ?? false)
    ? args.cursorCommand
    : (provided['ideCommand'] ?? false)
      ? args.ideCommand
      : (fc['cursorCommand'] as string | undefined) ?? (fc['ideCommand'] as string | undefined) ?? null;

  const vscodeCommand = resolveValue(provided['vscodeCommand'] ?? false, args.vscodeCommand, fc['vscodeCommand'] as string | undefined, null);
  const ngrokApiKey = resolveValue(provided['ngrokApiKey'] ?? false, args.ngrokApiKey, fc['ngrokApiKey'] as string | undefined, null);
  const ngrokDomain = resolveValue(provided['ngrokDomain'] ?? false, args.ngrokDomain, fc['ngrokDomain'] as string | undefined, null);
  const openaiApiKey = resolveValue(provided['openaiApiKey'] ?? false, args.openaiApiKey, fc['openaiApiKey'] as string | undefined, null);
  const terminalSessionMode = resolveValue(provided['terminalSessionMode'] ?? false, args.terminalSessionMode, fc['terminalSessionMode'] as string | undefined, 'auto');

  const automationApiKey = (fc['automationApiKey'] as string | undefined) ?? null;
  const branchNameLlm = (fc['branchNameLlm'] as string | undefined) ?? null;
  const planLlm = (fc['planLlm'] as string | undefined) ?? null;

  const uiPath = uiInput ? path.resolve(process.cwd(), uiInput) : BUNDLED_UI_PATH;
  const workdir = workdirInput ? path.resolve(process.cwd(), workdirInput) : process.cwd();

  return {
    port,
    host,
    uiPath,
    workdir,
    password,
    showPassword: args.showPassword,
    defaultBranch,
    defaultBranches,
    cookieSecure: cookieSecure ?? 'auto',
    codexCommand,
    claudeCommand,
    cursorCommand,
    ideCommand,
    vscodeCommand,
    ngrokApiKey,
    ngrokDomain,
    automationApiKey,
    openaiApiKey,
    branchNameLlm,
    planLlm,
    terminalSessionMode: terminalSessionMode ?? 'auto',
  };
}

export function validateNgrokConfig(config: ResolvedConfig): void {
  const hasApiKey = Boolean(config.ngrokApiKey);
  const hasDomain = Boolean(config.ngrokDomain);

  if ((hasApiKey && !hasDomain) || (hasDomain && !hasApiKey)) {
    throw new Error('Both --ngrok-api-key and --ngrok-domain must be provided together.');
  }
}

export function buildConfigToSave(
  config: ResolvedConfig,
  args: ParsedArgs,
  fileConfig: Record<string, unknown>,
): Record<string, unknown> {
  const { _provided: provided } = args;
  const fc = fileConfig;

  const configToSave: Record<string, unknown> = {
    port: config.port,
    host: config.host,
  };

  const uiInput = (provided['ui'] ?? false) ? args.ui : (fc['ui'] as string | undefined) ?? null;
  if (uiInput) {
    configToSave['ui'] = uiInput;
  }

  const workdirInput = (provided['workdir'] ?? false) ? args.workdir : (fc['workdir'] as string | undefined) ?? null;
  if (workdirInput) {
    configToSave['workdir'] = workdirInput;
  }

  if (config.password) {
    configToSave['password'] = config.password;
  }

  if (config.defaultBranch) {
    configToSave['defaultBranch'] = config.defaultBranch;
  }

  if (config.defaultBranches) {
    configToSave['defaultBranches'] = config.defaultBranches;
  }

  if (config.cookieSecure && config.cookieSecure !== 'auto') {
    configToSave['cookies'] = { secure: config.cookieSecure };
  }

  if (config.branchNameLlm) {
    configToSave['branchNameLlm'] = config.branchNameLlm;
  }

  if (config.planLlm) {
    configToSave['planLlm'] = config.planLlm;
  }

  if ((provided['terminalSessionMode'] ?? false) || fc['terminalSessionMode'] !== undefined) {
    configToSave['terminalSessionMode'] = config.terminalSessionMode;
  }

  const commandsConfig: Record<string, string> = {};
  if (config.codexCommand) commandsConfig['codex'] = config.codexCommand;
  if (config.claudeCommand) commandsConfig['claude'] = config.claudeCommand;
  if (config.cursorCommand) commandsConfig['cursor'] = config.cursorCommand;
  if (config.ideCommand) commandsConfig['ide'] = config.ideCommand;
  if (config.vscodeCommand) commandsConfig['vscode'] = config.vscodeCommand;

  if (Object.keys(commandsConfig).length > 0) {
    configToSave['commands'] = commandsConfig;
  }

  if (config.ngrokApiKey && config.ngrokDomain) {
    configToSave['ngrok'] = {
      apiKey: config.ngrokApiKey,
      domain: config.ngrokDomain,
    };
  }

  if (config.automationApiKey) {
    configToSave['automation'] = {
      apiKey: config.automationApiKey,
    };
  }

  if (config.openaiApiKey) {
    configToSave['openaiApiKey'] = config.openaiApiKey;
  }

  return configToSave;
}

