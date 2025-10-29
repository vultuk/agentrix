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
import { createAgentCommands } from '../config/agent-commands.js';
import { createBranchNameGenerator } from '../core/branch-name.js';

export async function startServer({
  uiPath,
  port = DEFAULT_PORT,
  host = DEFAULT_HOST,
  workdir,
  password,
  commandOverrides,
  ngrok: ngrokConfig,
  automationApiKey,
  openaiApiKey,
} = {}) {
  if (!uiPath) {
    throw new Error('Missing required option: uiPath');
  }

  const uiProvider = await createUiProvider(uiPath);
  const resolvedWorkdir = workdir ? await resolveWorkdir(workdir) : process.cwd();
  const resolvedPassword =
    typeof password === 'string' && password.length > 0 ? password : generateRandomPassword();
  const authManager = createAuthManager(resolvedPassword);
  const agentCommands = createAgentCommands(commandOverrides);
  const resolvedOpenAiKey = openaiApiKey ?? process.env.OPENAI_API_KEY ?? undefined;
  if (resolvedOpenAiKey && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = resolvedOpenAiKey;
  }
  const branchNameGenerator = createBranchNameGenerator({ apiKey: resolvedOpenAiKey });
  const router = createRouter({
    authManager,
    workdir: resolvedWorkdir,
    agentCommands,
    automationApiKey,
    branchNameGenerator,
    openaiApiKey: resolvedOpenAiKey,
  });

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

  let ngrokListener = null;
  let ngrokUrl = null;

  const shouldStartNgrok =
    Boolean(ngrokConfig?.apiKey) && Boolean(ngrokConfig?.domain);

  if (shouldStartNgrok) {
    try {
      const { forward } = await import('@ngrok/ngrok');
      ngrokListener = await forward({
        addr: port,
        authtoken: ngrokConfig.apiKey,
        domain: ngrokConfig.domain,
      });
      ngrokUrl = ngrokListener.url();
    } catch (error) {
      await disposeAllSessions().catch(() => {});
      await closeWebSockets().catch(() => {});
      try {
        await new Promise((resolve) => {
          server.close(() => resolve());
        });
      } catch {
        // ignore errors during shutdown
      }
      authManager.clear();
      throw new Error(
        `Failed to establish ngrok tunnel: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  let closing = false;
  async function closeAll() {
    if (closing) {
      return;
    }
    closing = true;

    const serverClose = new Promise((resolve) => {
      server.close(() => resolve());
    });

    const closeTasks = [
      disposeAllSessions(),
      closeWebSockets(),
      serverClose,
    ];
    if (ngrokListener) {
      closeTasks.push(
        ngrokListener
          .close()
          .catch((err) =>
            console.error('[terminal-worktree] Failed to close ngrok tunnel:', err),
          ),
      );
    }

    await Promise.allSettled(closeTasks);

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
    commands: agentCommands,
    publicUrl: ngrokUrl,
  };
}

export { DEFAULT_HOST, DEFAULT_PORT, generateRandomPassword };
