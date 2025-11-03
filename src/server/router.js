import { createAuthHandlers } from '../api/auth.js';
import { createAutomationHandlers } from '../api/automation.js';
import { createRepoHandlers } from '../api/repos.js';
import { createRepoDashboardHandlers } from '../api/repo-dashboard.js';
import { createRepoIssueHandlers } from '../api/repo-issue.js';
import { createSessionHandlers } from '../api/sessions.js';
import { createTerminalHandlers } from '../api/terminal.js';
import { createWorktreeHandlers } from '../api/worktrees.js';
import { createGitStatusHandlers } from '../api/git-status.js';
import { sendJson, readJsonBody } from '../utils/http.js';
import { createConfigHandlers } from '../api/config.js';
import { createPlanHandlers } from '../api/create-plan.js';
import { createPlanArtifactHandlers } from '../api/plans.js';
import { createEventStreamHandler } from './events.js';
import { createTaskHandlers } from '../api/tasks.js';

export function createRouter({
  authManager,
  workdir,
  agentCommands,
  automationApiKey,
  branchNameGenerator,
  planService,
  defaultBranches,
  cookieManager,
}) {
  if (!authManager) {
    throw new Error('authManager is required');
  }
  if (!agentCommands) {
    throw new Error('agentCommands is required');
  }

  const authHandlers = createAuthHandlers(authManager, { cookieManager });
  const automationHandlers = createAutomationHandlers({
    workdir,
    agentCommands,
    apiKey: automationApiKey,
    branchNameGenerator,
    planService,
    defaultBranches,
  });
  const repoHandlers = createRepoHandlers(workdir);
  const repoDashboardHandlers = createRepoDashboardHandlers(workdir);
  const repoIssueHandlers = createRepoIssueHandlers(workdir);
  const sessionHandlers = createSessionHandlers(workdir);
  const worktreeHandlers = createWorktreeHandlers(workdir, branchNameGenerator, defaultBranches);
  const terminalHandlers = createTerminalHandlers(workdir);
  const configHandlers = createConfigHandlers(agentCommands);
  const planHandlers = createPlanHandlers({ planService });
  const gitStatusHandlers = createGitStatusHandlers(workdir);
  const planArtifactHandlers = createPlanArtifactHandlers(workdir);
  const eventStreamHandler = createEventStreamHandler({ authManager, workdir });
  const taskHandlers = createTaskHandlers();

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
      '/api/repos/init-command',
      {
        requiresAuth: true,
        handlers: { POST: repoHandlers.updateInitCommand },
      },
    ],
    [
      '/api/repos/dashboard',
      {
        requiresAuth: true,
        handlers: { GET: repoDashboardHandlers.read, HEAD: repoDashboardHandlers.read },
      },
    ],
    [
      '/api/repos/issue',
      {
        requiresAuth: true,
        handlers: { GET: repoIssueHandlers.read, HEAD: repoIssueHandlers.read },
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
    [
      '/api/plans',
      {
        requiresAuth: true,
        handlers: { GET: planArtifactHandlers.list },
      },
    ],
    [
      '/api/plans/content',
      {
        requiresAuth: true,
        handlers: { GET: planArtifactHandlers.read },
      },
    ],
    [
      '/api/events',
      {
        requiresAuth: true,
        handlers: { GET: eventStreamHandler },
      },
    ],
    [
      '/api/tasks',
      {
        requiresAuth: true,
        handlers: { GET: taskHandlers.list, HEAD: taskHandlers.list },
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
    if (url.pathname.startsWith('/api/tasks/')) {
      if (!authManager.isAuthenticated(req)) {
        sendJson(res, 401, { error: 'Authentication required' });
        return true;
      }
      if (req.method && !['GET', 'HEAD'].includes(req.method.toUpperCase())) {
        handleMethodNotAllowed(res, ['GET', 'HEAD']);
        return true;
      }
      const taskId = url.pathname.slice('/api/tasks/'.length);
      if (!taskId) {
        sendJson(res, 404, { error: 'Task not found' });
        return true;
      }
      const context = {
        req,
        res,
        url,
        method: req.method?.toUpperCase() || 'GET',
        params: { id: taskId },
        workdir,
        readJsonBody: () => readJsonBody(req),
      };
      await taskHandlers.read(context, taskId);
      return true;
    }

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
