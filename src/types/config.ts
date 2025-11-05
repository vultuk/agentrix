/**
 * Configuration type definitions
 */

export interface AgentCommand {
  command: string;
  label: string;
}

export interface AgentCommands {
  claude?: AgentCommand;
  cursor?: AgentCommand;
  codex?: AgentCommand;
  [key: string]: AgentCommand | undefined;
}

export interface CommandOverrides {
  claude?: string;
  cursor?: string;
  codex?: string;
  [key: string]: string | undefined;
}

export interface DefaultBranchConfig {
  global?: string;
  repositories?: {
    [orgRepo: string]: string;
  };
}

export interface NgrokConfig {
  apiKey?: string;
  domain?: string;
}

export interface ServerConfig {
  uiPath: string;
  port?: number;
  host?: string;
  workdir?: string;
  password?: string;
  commandOverrides?: CommandOverrides;
  ngrok?: NgrokConfig;
  automationApiKey?: string;
  openaiApiKey?: string;
  branchNameLlm?: string;
  planLlm?: string;
  defaultBranches?: DefaultBranchConfig;
  cookieSecure?: string | boolean;
  terminalSessionMode?: 'auto' | 'tmux' | 'pty';
}

