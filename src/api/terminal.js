import { getOrCreateTerminalSession, getSessionById } from '../core/terminal-sessions.js';
import { sendJson } from '../utils/http.js';

export function createTerminalHandlers(workdir) {
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

    if (!org || !repo || !branch) {
      sendJson(context.res, 400, { error: 'org, repo, and branch are required' });
      return;
    }
    if (branch.toLowerCase() === 'main') {
      sendJson(context.res, 400, { error: 'Terminal access to the main branch is disabled' });
      return;
    }

    try {
      const { session, created } = await getOrCreateTerminalSession(workdir, org, repo, branch);
      if (command) {
        const commandInput = /[\r\n]$/.test(command) ? command : `${command}\r`;
        session.process.write(commandInput);
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

    session.process.write(input);
    sendJson(context.res, 200, { ok: true });
  }

  return { open, send };
}
