import fs from 'node:fs/promises';
import path from 'node:path';
import { getConfigFilePath } from './constants.js';
import {
  validatePort,
  validateString,
  validateBranchLlm,
  validateTerminalSessionMode,
  validateCookieSecure,
  pickFirst,
  warnConfig,
} from './validation.js';
import type { NormalizedConfig } from './types.js';

interface ConfigSource {
  value: unknown;
  name: string;
}

function pickString(sources: ConfigSource[], configPath: string): string | undefined {
  return pickFirst(sources, validateString, configPath);
}

function pickLlm(sources: ConfigSource[], configPath: string): string | undefined {
  return pickFirst(sources, validateBranchLlm, configPath);
}

function normalizeDefaultBranches(
  config: Record<string, unknown>,
  configPath: string,
): Record<string, string> | undefined {
  const defaultBranchesOverride =
    config['defaultBranches'] && typeof config['defaultBranches'] === 'object'
      ? (config['defaultBranches'] as Record<string, unknown>)
      : null;

  if (!defaultBranchesOverride) {
    return undefined;
  }

  const overrides: Record<string, string> = {};
  for (const [key, value] of Object.entries(defaultBranchesOverride)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        overrides[key.trim()] = trimmed;
      }
    } else {
      warnConfig(`Ignoring non-string defaultBranches entry for ${key} in ${configPath || 'config'}.`);
    }
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

function extractNestedObject(config: Record<string, unknown>, key: string): Record<string, unknown> | null {
  return config[key] && typeof config[key] === 'object'
    ? (config[key] as Record<string, unknown>)
    : null;
}

export function normalizeConfig(rawConfig: unknown, configPath: string): Record<string, unknown> {
  if (!rawConfig || typeof rawConfig !== 'object') {
    if (rawConfig !== undefined) {
      warnConfig(`Ignoring config at ${configPath || 'config'} because it is not a JSON object.`);
    }
    return {};
  }

  const config = rawConfig as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};

  const commands = extractNestedObject(config, 'commands');
  const branchName = extractNestedObject(config, 'branchName');
  const plan = extractNestedObject(config, 'plan');
  const openai = extractNestedObject(config, 'openai');
  const automation = extractNestedObject(config, 'automation');
  const ngrok = extractNestedObject(config, 'ngrok');
  const cookieConfig = extractNestedObject(config, 'cookies');

  // Port
  const port = validatePort(config['port'], 'port', configPath);
  if (port !== undefined) normalized['port'] = port;

  // Host
  const host = validateString(config['host'], 'host', configPath);
  if (host !== undefined) normalized['host'] = host;

  // UI path
  const ui = pickString(
    [
      { value: config['ui'], name: 'ui' },
      { value: config['uiPath'], name: 'uiPath' },
    ],
    configPath,
  );
  if (ui !== undefined) normalized['ui'] = ui;

  // Working directory
  const workdir = pickString(
    [
      { value: config['workdir'], name: 'workdir' },
      { value: config['workDir'], name: 'workDir' },
    ],
    configPath,
  );
  if (workdir !== undefined) normalized['workdir'] = workdir;

  // Default branch
  const defaultBranch = validateString(config['defaultBranch'], 'defaultBranch', configPath);
  if (defaultBranch !== undefined) normalized['defaultBranch'] = defaultBranch;

  // Default branches overrides
  const defaultBranches = normalizeDefaultBranches(config, configPath);
  if (defaultBranches) normalized['defaultBranches'] = defaultBranches;

  // Cookie secure
  const cookieSecureRaw = cookieConfig?.['secure'] ?? config['cookieSecure'];
  const cookieSecure = validateCookieSecure(cookieSecureRaw, 'cookieSecure', configPath);
  if (cookieSecure !== undefined) normalized['cookieSecure'] = cookieSecure;

  // Password
  const password = validateString(config['password'], 'password', configPath);
  if (password !== undefined) normalized['password'] = password;

  // Commands
  const codexCommand = pickString(
    [
      { value: config['codexCommand'], name: 'codexCommand' },
      { value: commands?.['codex'], name: 'commands.codex' },
    ],
    configPath,
  );
  if (codexCommand !== undefined) normalized['codexCommand'] = codexCommand;

  const claudeCommand = pickString(
    [
      { value: config['claudeCommand'], name: 'claudeCommand' },
      { value: commands?.['claude'], name: 'commands.claude' },
    ],
    configPath,
  );
  if (claudeCommand !== undefined) normalized['claudeCommand'] = claudeCommand;

  const cursorCommand = pickString(
    [
      { value: config['cursorCommand'], name: 'cursorCommand' },
      { value: commands?.['cursor'], name: 'commands.cursor' },
    ],
    configPath,
  );
  if (cursorCommand !== undefined) normalized['cursorCommand'] = cursorCommand;

  const ideCommand = pickString(
    [
      { value: config['ideCommand'], name: 'ideCommand' },
      { value: commands?.['ide'], name: 'commands.ide' },
    ],
    configPath,
  );
  if (ideCommand !== undefined) normalized['ideCommand'] = ideCommand;

  const vscodeCommand = pickString(
    [
      { value: config['vscodeCommand'], name: 'vscodeCommand' },
      { value: commands?.['vscode'], name: 'commands.vscode' },
    ],
    configPath,
  );
  if (vscodeCommand !== undefined) normalized['vscodeCommand'] = vscodeCommand;

  // LLM configuration
  const branchNameLlm = pickLlm(
    [
      { value: config['branchNameLlm'], name: 'branchNameLlm' },
      { value: config['branchNameLLM'], name: 'branchNameLLM' },
      { value: config['branchLlm'], name: 'branchLlm' },
      { value: config['branchLLM'], name: 'branchLLM' },
      { value: config['defaultBranchLlm'], name: 'defaultBranchLlm' },
      { value: config['defaultBranchLLM'], name: 'defaultBranchLLM' },
      { value: branchName?.['llm'], name: 'branchName.llm' },
      { value: branchName?.['default'], name: 'branchName.default' },
      { value: branchName?.['model'], name: 'branchName.model' },
    ],
    configPath,
  );
  if (branchNameLlm !== undefined) normalized['branchNameLlm'] = branchNameLlm;

  const planLlm = pickLlm(
    [
      { value: config['planLlm'], name: 'planLlm' },
      { value: config['planLLM'], name: 'planLLM' },
      { value: config['createPlanLlm'], name: 'createPlanLlm' },
      { value: config['createPlanLLM'], name: 'createPlanLLM' },
      { value: config['defaultPlanLlm'], name: 'defaultPlanLlm' },
      { value: config['defaultPlanLLM'], name: 'defaultPlanLLM' },
      { value: plan?.['llm'], name: 'plan.llm' },
      { value: plan?.['default'], name: 'plan.default' },
      { value: plan?.['model'], name: 'plan.model' },
    ],
    configPath,
  );
  if (planLlm !== undefined) normalized['planLlm'] = planLlm;

  // Terminal session mode
  const terminalSessionMode = validateTerminalSessionMode(
    config['terminalSessionMode'],
    'terminalSessionMode',
    configPath,
  );
  if (terminalSessionMode !== undefined) normalized['terminalSessionMode'] = terminalSessionMode;

  // ngrok
  const ngrokApiKey = pickString(
    [
      { value: config['ngrokApiKey'], name: 'ngrokApiKey' },
      { value: ngrok?.['apiKey'], name: 'ngrok.apiKey' },
      { value: ngrok?.['authtoken'], name: 'ngrok.authtoken' },
      { value: ngrok?.['token'], name: 'ngrok.token' },
    ],
    configPath,
  );
  if (ngrokApiKey !== undefined) normalized['ngrokApiKey'] = ngrokApiKey;

  const ngrokDomain = pickString(
    [
      { value: config['ngrokDomain'], name: 'ngrokDomain' },
      { value: ngrok?.['domain'], name: 'ngrok.domain' },
    ],
    configPath,
  );
  if (ngrokDomain !== undefined) normalized['ngrokDomain'] = ngrokDomain;

  // API keys
  const automationApiKey = pickString(
    [
      { value: config['automationApiKey'], name: 'automationApiKey' },
      { value: config['apiKey'], name: 'apiKey' },
      { value: automation?.['apiKey'], name: 'automation.apiKey' },
    ],
    configPath,
  );
  if (automationApiKey !== undefined) normalized['automationApiKey'] = automationApiKey;

  const openaiApiKey = pickString(
    [
      { value: config['openaiApiKey'], name: 'openaiApiKey' },
      { value: openai?.['apiKey'], name: 'openai.apiKey' },
    ],
    configPath,
  );
  if (openaiApiKey !== undefined) normalized['openaiApiKey'] = openaiApiKey;

  return normalized;
}

export async function loadConfig(): Promise<NormalizedConfig> {
  const configPath = getConfigFilePath();
  if (!configPath) {
    return { values: {}, path: null };
  }

  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (error) {
    const err = error as { code?: string; message?: string };
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      return { values: {}, path: configPath };
    }
    warnConfig(`Failed to read config at ${configPath}: ${err?.message || String(error)}`);
    return { values: {}, path: configPath };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    const err = error as { message?: string };
    warnConfig(`Failed to parse config at ${configPath}: ${err?.message || String(error)}`);
    return { values: {}, path: configPath };
  }

  return { values: normalizeConfig(parsed, configPath), path: configPath };
}

export async function saveConfig(configValues: Record<string, unknown>): Promise<string> {
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


