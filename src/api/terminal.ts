import { createTerminalService, type TerminalService } from '../services/index.js';
import { createHandler } from './base-handler.js';
import { validateTerminalOpen, validateTerminalSend } from '../validation/index.js';
import type { TerminalOpenInput, TerminalSendInput } from '../validation/index.js';

export interface TerminalHandlerOptions {
  mode?: string;
  terminalService?: TerminalService;
}

export function createTerminalHandlers(workdir: string, options: TerminalHandlerOptions = {}) {
  const { mode, terminalService: providedTerminalService } = options;
  const terminalService = providedTerminalService ?? createTerminalService(workdir, mode ? { mode } : {});

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
