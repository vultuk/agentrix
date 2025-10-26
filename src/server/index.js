import http from 'node:http';

import { DEFAULT_HOST, DEFAULT_PORT } from '../config/constants.js';
import { createAuthManager } from '../core/auth.js';
import { resolveWorkdir } from '../core/workdir.js';
import { disposeAllSessions } from '../core/terminal-sessions.js';
import { generateRandomPassword } from '../utils/random.js';
import { sendJson } from '../utils/http.js';
import { createRouter } from './router.js';
import { attachTerminalWebSockets } from './websocket.js';
import { createUiProvider } from './ui.js';

export async function startServer({
  uiPath,
  port = DEFAULT_PORT,
  host = DEFAULT_HOST,
  workdir,
  password,
} = {}) {
  if (!uiPath) {
    throw new Error('Missing required option: uiPath');
  }

  const uiProvider = await createUiProvider(uiPath);
  const resolvedWorkdir = workdir ? await resolveWorkdir(workdir) : process.cwd();
  const resolvedPassword =
    typeof password === 'string' && password.length > 0 ? password : generateRandomPassword();
  const authManager = createAuthManager(resolvedPassword);
  const router = createRouter({ authManager, workdir: resolvedWorkdir });

  const server = http.createServer(async (req, res) => {
    try {
      const handled = await router(req, res);
      if (handled) {
        return;
      }

      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) {
        sendJson(res, 404, { error: 'Not Found' });
        return;
      }

      await uiProvider.serve(req, res);
    } catch (error) {
      console.error('[terminal-worktree] Request handling error:', error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end('Internal Server Error');
      } else {
        res.end();
      }
    }
  });

  const { close: closeWebSockets } = attachTerminalWebSockets(server, authManager);

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  let closing = false;
  async function closeAll() {
    if (closing) {
      return;
    }
    closing = true;

    const serverClose = new Promise((resolve) => {
      server.close(() => resolve());
    });

    await Promise.allSettled([
      disposeAllSessions(),
      closeWebSockets(),
      serverClose,
    ]);

    authManager.clear();
  }

  return {
    server,
    host,
    port,
    uiPath: uiProvider.resolvedPath,
    workdir: resolvedWorkdir,
    close: closeAll,
    password: resolvedPassword,
  };
}

export { DEFAULT_HOST, DEFAULT_PORT, generateRandomPassword };
