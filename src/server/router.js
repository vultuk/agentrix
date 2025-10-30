import { createAuthHandlers } from '../api/auth.js';
import { createAutomationHandlers } from '../api/automation.js';
import { createRepoHandlers } from '../api/repos.js';
import { createSessionHandlers } from '../api/sessions.js';
import { createTerminalHandlers } from '../api/terminal.js';
import { createWorktreeHandlers } from '../api/worktrees.js';
import { createGitStatusHandlers } from '../api/git-status.js';
import { sendJson, readJsonBody } from '../utils/http.js';
import { createConfigHandlers } from '../api/config.js';
import { createPlanHandlers } from '../api/create-plan.js';

export function createRouter({
  authManager,
  workdir,
  agentCommands,
  automationApiKey,
  branchNameGenerator,
  planService,
}) {
  if (!authManager) {
    throw new Error('authManager is required');
  }
  if (!agentCommands) {
    throw new Error('agentCommands is required');
  }

  const authHandlers = createAuthHandlers(authManager);
  const automationHandlers = createAutomationHandlers({
    workdir,
    agentCommands,
    apiKey: automationApiKey,
    branchNameGenerator,
    planService,
  });
  const repoHandlers = createRepoHandlers(workdir);
  const sessionHandlers = createSessionHandlers(workdir);
  const worktreeHandlers = createWorktreeHandlers(workdir, branchNameGenerator);
  const terminalHandlers = createTerminalHandlers(workdir);
  const configHandlers = createConfigHandlers(agentCommands);
  const planHandlers = createPlanHandlers({ planService });
  const gitStatusHandlers = createGitStatusHandlers(workdir);

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
      '/api/git/status',
      {
        requiresAuth: true,
        handlers: { GET: gitStatusHandlers.read, HEAD: gitStatusHandlers.read },
      },
    ],
    [
      '/api/git/diff',
      {
        requiresAuth: true,
        handlers: { POST: gitStatusHandlers.diff },
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
    [
      '/api/commands',
      {
        requiresAuth: true,
        handlers: { GET: configHandlers.commands, HEAD: configHandlers.commands },
      },
    ],
    [
      '/api/automation/launch',
      {
        requiresAuth: false,
        handlers: { POST: automationHandlers.launch },
      },
    ],
    [
      '/api/create-plan',
      {
        requiresAuth: true,
        handlers: { POST: planHandlers.create },
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
