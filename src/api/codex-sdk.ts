import { createCodexSdkService, type CodexSdkService } from '../services/index.js';
import { createHandler } from './base-handler.js';
import { asyncHandler, NotFoundError } from '../infrastructure/errors/index.js';
import { sendJson } from '../utils/http.js';
import {
  validateCodexSessionList,
  validateCodexSessionCreate,
  validateCodexSessionId,
} from '../validation/index.js';

export interface CodexSdkHandlerOverrides {
  codexSdkService?: CodexSdkService;
}

export function createCodexSdkHandlers(workdir: string, overrides: CodexSdkHandlerOverrides = {}) {
  const codexSdkService = overrides.codexSdkService ?? createCodexSdkService(workdir);

  const listSessions = asyncHandler(async (context) => {
    const paramsObject = Object.fromEntries(context.url.searchParams.entries());
    const input = validateCodexSessionList(paramsObject);
    const sessions = await codexSdkService.listSessions(input);
    sendJson(context.res, 200, { sessions });
  });

  const createSession = createHandler({
    validator: validateCodexSessionCreate,
    handler: async (input) => codexSdkService.createSession(input),
  });

  const readSession = asyncHandler(async (context) => {
    const { sessionId } = validateCodexSessionId({ sessionId: context.params?.['id'] });
    const detail = await codexSdkService.getSession(sessionId);
    if (!detail) {
      throw new NotFoundError('Codex session not found');
    }
    sendJson(context.res, 200, detail);
  });

  const deleteSession = asyncHandler(async (context) => {
    const { sessionId } = validateCodexSessionId({ sessionId: context.params?.['id'] });
    await codexSdkService.deleteSession(sessionId);
    sendJson(context.res, 200, { ok: true });
  });

  return {
    listSessions,
    createSession,
    readSession,
    deleteSession,
  };
}
