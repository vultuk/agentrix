import { createAuthHandlers } from '../api/auth.js';
import { createRepoHandlers } from '../api/repos.js';
import { createSessionHandlers } from '../api/sessions.js';
import { createTerminalHandlers } from '../api/terminal.js';
import { createWorktreeHandlers } from '../api/worktrees.js';
import { sendJson, readJsonBody } from '../utils/http.js';

export function createRouter({ authManager, workdir }) {
  if (!authManager) {
    throw new Error('authManager is required');
  }

  const authHandlers = createAuthHandlers(authManager);
  const repoHandlers = createRepoHandlers(workdir);
  const sessionHandlers = createSessionHandlers(workdir);
  const worktreeHandlers = createWorktreeHandlers(workdir);
  const terminalHandlers = createTerminalHandlers(workdir);

  const routes = new Map([
    [
      '/api/auth/login',
      {
        requiresAuth: false,
        handlers: { POST: authHandlers.login },
      },
    ],
    [
      '/api/auth/logout',
      {
        requiresAuth: false,
        handlers: { POST: authHandlers.logout },
      },
    ],
    [
      '/api/auth/status',
      {
        requiresAuth: false,
        handlers: { GET: authHandlers.status, HEAD: authHandlers.status },
      },
    ],
    [
      '/api/repos',
      {
        requiresAuth: true,
        handlers: {
          GET: repoHandlers.list,
          HEAD: repoHandlers.list,
          POST: repoHandlers.create,
          DELETE: repoHandlers.destroy,
        },
      },
    ],
    [
      '/api/sessions',
      {
        requiresAuth: true,
        handlers: { GET: sessionHandlers.list, HEAD: sessionHandlers.list },
      },
    ],
    [
      '/api/worktrees',
      {
        requiresAuth: true,
        handlers: { POST: worktreeHandlers.upsert, DELETE: worktreeHandlers.destroy },
      },
    ],
    [
      '/api/terminal/open',
      {
        requiresAuth: true,
        handlers: { POST: terminalHandlers.open },
      },
    ],
    [
      '/api/terminal/send',
      {
        requiresAuth: true,
        handlers: { POST: terminalHandlers.send },
      },
    ],
  ]);

  function handleMethodNotAllowed(res, allowedMethods = []) {
    const headerValue = allowedMethods.join(', ');
    if (headerValue) {
      res.setHeader('Allow', headerValue);
    }
    res.statusCode = 405;
    res.end('Method Not Allowed');
  }

  return async function route(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const route = routes.get(url.pathname);
    if (!route) {
      return false;
    }

    const method = req.method?.toUpperCase() || 'GET';
    const allowed = route.handlers[method];

    if (!allowed) {
      handleMethodNotAllowed(res, Object.keys(route.handlers));
      return true;
    }

    if (route.requiresAuth && !authManager.isAuthenticated(req)) {
      sendJson(res, 401, { error: 'Authentication required' });
      return true;
    }

    const context = {
      req,
      res,
      url,
      method,
      workdir,
      readJsonBody: () => readJsonBody(req),
    };

    await allowed(context);
    return true;
  };
}
