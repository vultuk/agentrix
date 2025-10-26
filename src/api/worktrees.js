import { createWorktree, discoverRepositories, normaliseBranchName, removeWorktree } from '../core/git.js';
import {
  detectTmux,
  isTmuxAvailable,
  makeTmuxSessionName,
  tmuxKillSession,
} from '../core/tmux.js';
import { disposeSessionByKey, makeSessionKey } from '../core/terminal-sessions.js';
import { sendJson } from '../utils/http.js';

export function createWorktreeHandlers(workdir) {
  async function upsert(context) {
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

    if (!org || !repo || !branch) {
      sendJson(context.res, 400, { error: 'org, repo, and branch are required' });
      return;
    }

    try {
      await createWorktree(workdir, org, repo, branch);
      const data = await discoverRepositories(workdir);
      sendJson(context.res, 200, { data });
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

    const org = typeof payload.org === 'string' ? payload.org.trim() : '';
    const repo = typeof payload.repo === 'string' ? payload.repo.trim() : '';
    const branch = typeof payload.branch === 'string' ? payload.branch.trim() : '';
    const normalised = normaliseBranchName(branch);

    if (!org || !repo || !normalised) {
      sendJson(context.res, 400, { error: 'org, repo, and branch are required' });
      return;
    }

    if (normalised.toLowerCase() === 'main') {
      sendJson(context.res, 500, { error: 'Cannot remove the main worktree' });
      return;
    }

    try {
      const sessionKey = makeSessionKey(org, repo, normalised);
      await disposeSessionByKey(sessionKey);
      await detectTmux();
      if (isTmuxAvailable()) {
        const tmuxSessionName = makeTmuxSessionName(org, repo, normalised);
        try {
          await tmuxKillSession(tmuxSessionName);
        } catch (error) {
          console.warn(`[terminal-worktree] Failed to kill tmux session ${tmuxSessionName}:`, error.message);
        }
      }

      await removeWorktree(workdir, org, repo, normalised);
      const data = await discoverRepositories(workdir);
      sendJson(context.res, 200, { data });
    } catch (error) {
      sendJson(context.res, 500, { error: error.message });
    }
  }

  return { upsert, destroy };
}
