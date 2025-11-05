const DEFAULT_CODEX_COMMAND = 'codex';
const DEFAULT_CODEX_DANGEROUS_SUFFIX = '--dangerously-bypass-approvals-and-sandbox';
const DEFAULT_CLAUDE_COMMAND = 'claude';
const DEFAULT_CLAUDE_DANGEROUS_SUFFIX = '--dangerously-skip-permissions';
const DEFAULT_CURSOR_COMMAND = 'cursor-agent';
const DEFAULT_VSCODE_COMMAND = 'code .';

export const DEFAULT_AGENT_COMMANDS = {
  codex: `${DEFAULT_CODEX_COMMAND}`,
  codexDangerous: `${DEFAULT_CODEX_COMMAND} ${DEFAULT_CODEX_DANGEROUS_SUFFIX}`,
  claude: `${DEFAULT_CLAUDE_COMMAND}`,
  claudeDangerous: `${DEFAULT_CLAUDE_COMMAND} ${DEFAULT_CLAUDE_DANGEROUS_SUFFIX}`,
  cursor: `${DEFAULT_CURSOR_COMMAND}`,
  vscode: `${DEFAULT_VSCODE_COMMAND}`,
} as const;

export interface AgentCommands {
  codex: string;
  codexDangerous: string;
  claude: string;
  claudeDangerous: string;
  cursor: string;
  vscode: string;
}

export interface AgentCommandOverrides {
  codex?: string;
  codexDangerous?: string;
  claude?: string;
  claudeDangerous?: string;
  cursor?: string;
  ide?: string;
  vscode?: string;
}

function appendDangerSuffix(base: string, suffix: string): string {
  const trimmed = typeof base === 'string' ? base.trim() : '';
  if (!trimmed) {
    return '';
  }
  return `${trimmed} ${suffix}`.trim();
}

export function createAgentCommands(overrides: AgentCommandOverrides = {}): AgentCommands {
  const codexBase =
    typeof overrides.codex === 'string' && overrides.codex.trim()
      ? overrides.codex.trim()
      : DEFAULT_AGENT_COMMANDS.codex;
  const claudeBase =
    typeof overrides.claude === 'string' && overrides.claude.trim()
      ? overrides.claude.trim()
      : DEFAULT_AGENT_COMMANDS.claude;
  const cursorCommand = (() => {
    if (typeof overrides.cursor === 'string' && overrides.cursor.trim()) {
      return overrides.cursor.trim();
    }
    if (typeof overrides.ide === 'string' && overrides.ide.trim()) {
      return overrides.ide.trim();
    }
    return DEFAULT_AGENT_COMMANDS.cursor;
  })();
  const vscodeCommand =
    typeof overrides.vscode === 'string' && overrides.vscode.trim()
      ? overrides.vscode.trim()
      : DEFAULT_AGENT_COMMANDS.vscode;

  const codexDangerous =
    typeof overrides.codexDangerous === 'string' && overrides.codexDangerous.trim()
      ? overrides.codexDangerous.trim()
      : appendDangerSuffix(codexBase, DEFAULT_CODEX_DANGEROUS_SUFFIX);

  const claudeDangerous =
    typeof overrides.claudeDangerous === 'string' && overrides.claudeDangerous.trim()
      ? overrides.claudeDangerous.trim()
      : appendDangerSuffix(claudeBase, DEFAULT_CLAUDE_DANGEROUS_SUFFIX);

  return {
    codex: codexBase,
    codexDangerous,
    claude: claudeBase,
    claudeDangerous,
    cursor: cursorCommand,
    vscode: vscodeCommand,
  };
}
