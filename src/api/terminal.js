import {
  getOrCreateTerminalSession,
  getSessionById,
  queueSessionInput,
} from '../core/terminal-sessions.js';
import { launchAgentProcess } from '../core/agents.js';
import { sendJson } from '../utils/http.js';

export function createTerminalHandlers(workdir, options = {}) {
  const mode = typeof options.mode === 'string' ? options.mode : 'auto';
  async function open(context) {
    let payload;
    try {
      payload = await context.readJsonBody();
    } catch (error) {
      sendJson(context.res, 400, { error: error.message });
      return;
    }

    const org = typeof payload.org === 'string' ? payload.org.trim() : '';
    const repo = typeof payload.repo === 'string' ? payload.repo.trim() : '';
    const branch = typeof payload.branch === 'string' ? payload.branch.trim() : '';
    const command = typeof payload.command === 'string' ? payload.command.trim() : '';
    const hasPrompt = Object.prototype.hasOwnProperty.call(payload, 'prompt');
    const prompt = hasPrompt ? payload.prompt : undefined;

    if (!org || !repo || !branch) {
      sendJson(context.res, 400, { error: 'org, repo, and branch are required' });
      return;
    }
    if (branch.toLowerCase() === 'main') {
      sendJson(context.res, 400, { error: 'Terminal access to the main branch is disabled' });
      return;
    }

    if (hasPrompt && typeof prompt !== 'string') {
      sendJson(context.res, 400, { error: 'prompt must be a string' });
      return;
    }

    try {
      if (hasPrompt) {
        if (!command) {
          sendJson(context.res, 400, {
            error: 'command must be provided when prompt is included',
          });
          return;
        }

        const { sessionId, createdSession } = await launchAgentProcess({
          command,
          workdir,
          org,
          repo,
          branch,
          prompt: prompt ?? '',
        });

        const session = getSessionById(sessionId);
        if (!session) {
          throw new Error('Terminal session not found after launch');
        }

        sendJson(context.res, 200, {
          sessionId,
          log: session.log || '',
          closed: Boolean(session.closed),
          created: Boolean(createdSession),
        });
        return;
      }

      const { session, created } = await getOrCreateTerminalSession(workdir, org, repo, branch, {
        mode,
      });
      if (command) {
        const commandInput = /[\r\n]$/.test(command) ? command : `${command}\r`;
        queueSessionInput(session, commandInput);
      }
      sendJson(context.res, 200, {
        sessionId: session.id,
        log: session.log || '',
        closed: Boolean(session.closed),
        created,
      });
    } catch (error) {
      sendJson(context.res, 500, { error: error.message });
    }
  }

  async function send(context) {
    let payload;
    try {
      payload = await context.readJsonBody();
    } catch (error) {
      sendJson(context.res, 400, { error: error.message });
      return;
    }

    const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : '';
    const input = typeof payload.input === 'string' ? payload.input : '';

    if (!sessionId) {
      sendJson(context.res, 400, { error: 'sessionId is required' });
      return;
    }

    const session = getSessionById(sessionId);
    if (!session || session.closed) {
      sendJson(context.res, 404, { error: 'Terminal session not found' });
      return;
    }

    queueSessionInput(session, input);
    sendJson(context.res, 200, { ok: true });
  }

  return { open, send };
}
