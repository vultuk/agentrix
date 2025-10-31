import { cloneRepository, discoverRepositories } from '../core/git.js';
import { emitReposUpdate } from '../core/event-bus.js';
import { removeRepository } from '../core/repositories.js';
import { sendJson } from '../utils/http.js';

export function createRepoHandlers(workdir) {
  async function list(context) {
    try {
      const payload = await discoverRepositories(workdir);
      if (context.method === 'HEAD') {
        context.res.statusCode = 200;
        context.res.setHeader('Cache-Control', 'no-store');
        context.res.end();
        return;
      }
      sendJson(context.res, 200, { data: payload });
    } catch (error) {
      const message = error?.message || 'Failed to read repositories';
      sendJson(context.res, 500, { error: message });
    }
  }

  async function create(context) {
    let payload;
    try {
      payload = await context.readJsonBody();
    } catch (error) {
      sendJson(context.res, 400, { error: error.message });
      return;
    }

    const repoUrl =
      typeof payload.url === 'string' && payload.url.trim()
        ? payload.url.trim()
        : typeof payload.repoUrl === 'string' && payload.repoUrl.trim()
          ? payload.repoUrl.trim()
          : '';

    if (!repoUrl) {
      sendJson(context.res, 400, { error: 'Repository URL is required' });
      return;
    }

    try {
      const repoInfo = await cloneRepository(workdir, repoUrl);
      const data = await discoverRepositories(workdir);
      sendJson(context.res, 200, { data, repo: repoInfo });
      emitReposUpdate(data);
    } catch (error) {
      sendJson(context.res, 500, { error: error.message });
    }
  }

  async function destroy(context) {
    let payload;
    try {
      payload = await context.readJsonBody();
    } catch (error) {
      sendJson(context.res, 400, { error: error.message });
      return;
    }

    const org = typeof payload?.org === 'string' ? payload.org.trim() : '';
    const repo = typeof payload?.repo === 'string' ? payload.repo.trim() : '';

    if (!org || !repo) {
      sendJson(context.res, 400, { error: 'org and repo are required' });
      return;
    }

    try {
      await removeRepository(workdir, org, repo);
      const data = await discoverRepositories(workdir);
      sendJson(context.res, 200, { data });
      emitReposUpdate(data);
    } catch (error) {
      sendJson(context.res, 500, { error: error.message });
    }
  }

  return { list, create, destroy };
}
