import { createSessionService } from '../services/session-service.js';
import { handleHeadRequest } from '../utils/http.js';
import { asyncHandler } from '../infrastructure/errors/index.js';
import type { RequestContext } from '../types/http.js';

export function createSessionHandlers(workdir: string) {
  const sessionService = createSessionService(workdir);

  const list = asyncHandler(async (context: RequestContext) => {
    if (context.method === 'HEAD') {
      handleHeadRequest(context.res);
      return;
    }

    const sessions = await sessionService.listSessions();
    context.res.setHeader('Cache-Control', 'no-store');
    context.res.statusCode = 200;
    context.res.setHeader('Content-Type', 'application/json; charset=utf-8');
    context.res.end(JSON.stringify({ sessions }));
  });

  return { list };
}
