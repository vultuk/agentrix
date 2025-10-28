import { sendJson } from '../utils/http.js';

export function createConfigHandlers(agentCommands) {
  const resolved = {
    codex: agentCommands?.codex || '',
    codexDangerous: agentCommands?.codexDangerous || '',
    claude: agentCommands?.claude || '',
    claudeDangerous: agentCommands?.claudeDangerous || '',
    ide: agentCommands?.ide || '',
    vscode: agentCommands?.vscode || '',
  };

  async function commands(context) {
    sendJson(context.res, 200, { commands: resolved });
  }

  return { commands };
}
