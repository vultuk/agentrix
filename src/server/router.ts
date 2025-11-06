import type { IncomingMessage, ServerResponse } from 'node:http';
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
import type { AuthManager, CookieManager } from '../types/auth.js';

export interface RouterConfig {
  authManager: AuthManager;
  workdir: string;
  agentCommands: unknown;
  automationApiKey?: string;
  branchNameGenerator: unknown;
  planService: unknown;
  defaultBranches: unknown;
  cookieManager?: CookieManager;
  terminalSessionMode?: 'auto' | 'tmux' | 'pty';
}

export type Router = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

type RouterDependencies = {
  createAuthHandlers: typeof createAuthHandlers;
  createAutomationHandlers: typeof createAutomationHandlers;
  createRepoHandlers: typeof createRepoHandlers;
  createRepoDashboardHandlers: typeof createRepoDashboardHandlers;
  createRepoIssueHandlers: typeof createRepoIssueHandlers;
  createSessionHandlers: typeof createSessionHandlers;
  createWorktreeHandlers: typeof createWorktreeHandlers;
  createTerminalHandlers: typeof createTerminalHandlers;
  createConfigHandlers: typeof createConfigHandlers;
  createPlanHandlers: typeof createPlanHandlers;
  createGitStatusHandlers: typeof createGitStatusHandlers;
  createPlanArtifactHandlers: typeof createPlanArtifactHandlers;
  createEventStreamHandler: typeof createEventStreamHandler;
  createTaskHandlers: typeof createTaskHandlers;
  sendJson: typeof sendJson;
  readJsonBody: typeof readJsonBody;
};

const defaultDependencies: RouterDependencies = {
  createAuthHandlers,
  createAutomationHandlers,
  createRepoHandlers,
  createRepoDashboardHandlers,
  createRepoIssueHandlers,
  createSessionHandlers,
  createWorktreeHandlers,
  createTerminalHandlers,
  createConfigHandlers,
  createPlanHandlers,
  createGitStatusHandlers,
  createPlanArtifactHandlers,
  createEventStreamHandler,
  createTaskHandlers,
  sendJson,
  readJsonBody,
};

let testOverrides: Partial<RouterDependencies> | null = null;

export function __setRouterTestOverrides(overrides?: Partial<RouterDependencies>): void {
  testOverrides = overrides ?? null;
}

function getDependency<K extends keyof RouterDependencies>(key: K): RouterDependencies[K] {
  return (testOverrides?.[key] ?? defaultDependencies[key]) as RouterDependencies[K];
}

export function createRouter({
  authManager,
  workdir,
  agentCommands,
  automationApiKey,
  branchNameGenerator,
  planService,
  defaultBranches,
  cookieManager,
  terminalSessionMode = 'auto',
}: RouterConfig): Router {
  if (!authManager) {
    throw new Error('authManager is required');
  }
  if (!agentCommands) {
    throw new Error('agentCommands is required');
  }

  const authHandlers = getDependency('createAuthHandlers')(authManager, { cookieManager });
  const automationHandlers = getDependency('createAutomationHandlers')({
    workdir,
    agentCommands,
    apiKey: automationApiKey,
    branchNameGenerator,
    planService,
    defaultBranches,
  });
  const repoHandlers = getDependency('createRepoHandlers')(workdir);
  const repoDashboardHandlers = getDependency('createRepoDashboardHandlers')(workdir);
  const repoIssueHandlers = getDependency('createRepoIssueHandlers')(workdir);
  const sessionHandlers = getDependency('createSessionHandlers')(workdir);
  const worktreeHandlers = getDependency('createWorktreeHandlers')(
    workdir,
    branchNameGenerator,
    defaultBranches,
  );
  const terminalHandlers = getDependency('createTerminalHandlers')(workdir, {
    mode: terminalSessionMode,
  });
  const configHandlers = getDependency('createConfigHandlers')(agentCommands as never);
  const planHandlers = getDependency('createPlanHandlers')({ planService: planService as never });
  const gitStatusHandlers = getDependency('createGitStatusHandlers')(workdir);
  const planArtifactHandlers = getDependency('createPlanArtifactHandlers')(workdir);
  const eventStreamHandler = getDependency('createEventStreamHandler')({ authManager, workdir });
  const taskHandlers = getDependency('createTaskHandlers')();
  const readJson = getDependency('readJsonBody');
  const sendJsonResponse = getDependency('sendJson');

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
          DELETE: repoHandlers.delete,
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
        handlers: { 
          POST: worktreeHandlers.create,
          DELETE: worktreeHandlers.delete,
        },
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

  function handleMethodNotAllowed(res: ServerResponse, allowedMethods: string[] = []): void {
    const headerValue = allowedMethods.join(', ');
    if (headerValue) {
      res.setHeader('Allow', headerValue);
    }
    res.statusCode = 405;
    res.end('Method Not Allowed');
  }

  return async function route(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/tasks/')) {
      if (!authManager.isAuthenticated(req)) {
        sendJsonResponse(res, 401, { error: 'Authentication required' });
        return true;
      }
      if (req.method && !['GET', 'HEAD'].includes(req.method.toUpperCase())) {
        handleMethodNotAllowed(res, ['GET', 'HEAD']);
        return true;
      }
      const taskId = url.pathname.slice('/api/tasks/'.length);
      if (!taskId) {
        sendJsonResponse(res, 404, { error: 'Task not found' });
        return true;
      }
      const context = {
        req,
        res,
        url,
        method: req.method?.toUpperCase() || 'GET',
        params: { id: taskId },
        workdir,
        readJsonBody: () => readJson(req),
      };
      await taskHandlers.read(context, taskId);
      return true;
    }

    const route = routes.get(url.pathname);
    if (!route) {
      return false;
    }

    const method = (req.method?.toUpperCase() || 'GET') as keyof typeof route.handlers;
    const allowed = route.handlers[method];

  if (!allowed) {
    handleMethodNotAllowed(res, Object.keys(route.handlers));
    return true;
  }

  if (route.requiresAuth && !authManager.isAuthenticated(req)) {
    sendJsonResponse(res, 401, { error: 'Authentication required' });
    return true;
  }

  const context = {
    req,
    res,
    url,
    method,
    workdir,
    readJsonBody: () => readJson(req),
  };

  await allowed(context);
  return true;
};
}
