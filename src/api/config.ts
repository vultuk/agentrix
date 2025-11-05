import { createSimpleHandler } from './base-handler.js';
import type { AgentCommands } from '../config/agent-commands.js';

export function createConfigHandlers(agentCommands: AgentCommands) {
  const resolved = {
    codex: agentCommands?.codex || '',
    codexDangerous: agentCommands?.codexDangerous || '',
    claude: agentCommands?.claude || '',
    claudeDangerous: agentCommands?.claudeDangerous || '',
    cursor: agentCommands?.cursor || '',
    vscode: agentCommands?.vscode || '',
  };

  const commands = createSimpleHandler(
    async () => ({ commands: resolved })
  );

  return { commands };
}
