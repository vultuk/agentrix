import {
  VALID_BRANCH_LLMS,
  VALID_TERMINAL_SESSION_MODES,
  VALID_COOKIE_SECURE_MODES,
} from './constants.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function warnConfig(message: string): void {
  process.stderr.write(`[terminal-worktree] ${message}\n`);
}

export function validatePort(value: unknown, name: string, configPath: string): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  let portValue: number | unknown = value;
  if (typeof portValue === 'string') {
    const trimmed = portValue.trim();
    if (!trimmed) {
      warnConfig(`Ignoring empty ${name} in ${configPath || 'config'}`);
      return undefined;
    }
    portValue = Number.parseInt(trimmed, 10);
  }

  if (!Number.isInteger(portValue as number) || (portValue as number) < 1 || (portValue as number) > 65535) {
    warnConfig(`Ignoring invalid ${name} in ${configPath || 'config'}; expected port between 1-65535.`);
    return undefined;
  }

  return portValue as number;
}

export function validateString(value: unknown, name: string, configPath: string): string | undefined {
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

export function validateBranchLlm(value: unknown, name: string, configPath: string): string | undefined {
  const stringValue = validateString(value, name, configPath);
  if (stringValue === undefined) {
    return undefined;
  }

  const lower = stringValue.toLowerCase();
  if (!VALID_BRANCH_LLMS.has(lower)) {
    warnConfig(
      `Ignoring invalid ${name} in ${configPath || 'config'}; expected one of ${[
        ...VALID_BRANCH_LLMS,
      ].join(', ')}.`,
    );
    return undefined;
  }

  return lower;
}

export function validateTerminalSessionMode(value: unknown, name: string, configPath: string): string | undefined {
  const stringValue = validateString(value, name, configPath);
  if (stringValue === undefined) {
    return undefined;
  }

  const lower = stringValue.toLowerCase();
  if (!VALID_TERMINAL_SESSION_MODES.has(lower)) {
    warnConfig(
      `Ignoring invalid ${name} in ${configPath || 'config'}; expected one of ${[
        ...VALID_TERMINAL_SESSION_MODES,
      ].join(', ')}.`,
    );
    return undefined;
  }

  return lower;
}

export function validateCookieSecure(value: unknown, name: string, configPath: string): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (VALID_COOKIE_SECURE_MODES.has(trimmed)) {
      return trimmed;
    }
    warnConfig(`Ignoring invalid ${name} in ${configPath || 'config'}; expected true, false, or auto.`);
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  return undefined;
}

export function pickFirst<T>(
  sources: Array<{ value: unknown; name: string }>,
  validator: (value: unknown, name: string, configPath: string) => T | undefined,
  configPath: string,
): T | undefined {
  for (const { value, name } of sources) {
    if (value === undefined || value === null) {
      continue;
    }
    const validated = validator(value, name, configPath);
    if (validated !== undefined) {
      return validated;
    }
  }
  return undefined;
}


