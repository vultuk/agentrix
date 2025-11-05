export interface CliConfig {
  port: number;
  host: string;
  ui: string | null;
  workdir: string | null;
  password: string | null;
  cookieSecure: string | null;
  defaultBranch: string | null;
  defaultBranches?: Record<string, string>;
  showPassword: boolean;
  codexCommand: string | null;
  claudeCommand: string | null;
  cursorCommand: string | null;
  ideCommand: string | null;
  vscodeCommand: string | null;
  ngrokApiKey: string | null;
  ngrokDomain: string | null;
  automationApiKey?: string | null;
  openaiApiKey: string | null;
  branchNameLlm?: string | null;
  planLlm?: string | null;
  terminalSessionMode: string | null;
  save: boolean;
  help: boolean;
  version: boolean;
}

export interface ParsedArgs extends CliConfig {
  _provided: Record<string, boolean>;
}

export interface PlansOptions {
  org: string;
  repo: string;
  branch: string;
  planId: string;
  limit?: number;
  workdir: string;
  help: boolean;
}

export interface NormalizedConfig {
  values: Record<string, unknown>;
  path: string | null;
}

export type TerminalSessionMode = 'auto' | 'tmux' | 'pty';
export type BranchLlm = 'codex' | 'claude' | 'cursor';
export type CookieSecureMode = 'true' | 'false' | 'auto';


