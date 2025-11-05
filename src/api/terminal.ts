import { createTerminalService } from '../services/index.js';
import { createHandler } from './base-handler.js';
import { validateTerminalOpen, validateTerminalSend } from '../validation/index.js';
import type { TerminalOpenInput, TerminalSendInput } from '../validation/index.js';

export function createTerminalHandlers(workdir: string, options: { mode?: string } = {}) {
  const terminalService = createTerminalService(workdir, options);

  const open = createHandler({
    validator: validateTerminalOpen,
    handler: async (input: TerminalOpenInput) => terminalService.openTerminal(input),
  });

  const send = createHandler({
    validator: validateTerminalSend,
    handler: async (input: TerminalSendInput) => terminalService.sendInput(input),
  });

  return { open, send };
}
