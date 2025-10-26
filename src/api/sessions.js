import { discoverRepositories } from '../core/git.js';
import {
  buildSanitisedWorktreeLookup,
  detectTmux,
  isTmuxAvailable,
  parseTmuxSessionName,
  runTmux,
} from '../core/tmux.js';
import { listActiveSessions, makeSessionKey } from '../core/terminal-sessions.js';
import { sendJson } from '../utils/http.js';

export function createSessionHandlers(workdir) {
  async function list(context) {
    if (context.method === 'HEAD') {
      context.res.statusCode = 200;
      context.res.setHeader('Cache-Control', 'no-store');
      context.res.end();
      return;
    }

    const sessions = [];
    const seenKeys = new Set();

    listActiveSessions().forEach((session) => {
      const key = makeSessionKey(session.org, session.repo, session.branch);
      if (seenKeys.has(key)) {
        return;
      }
      sessions.push({ org: session.org, repo: session.repo, branch: session.branch });
      seenKeys.add(key);
    });

    await detectTmux();
    if (isTmuxAvailable()) {
      let stdout = '';
      try {
        const result = await runTmux(['list-sessions', '-F', '#S']);
        stdout = result && typeof result.stdout === 'string' ? result.stdout : '';
      } catch (error) {
        if (typeof error.code === 'number') {
          stdout = '';
        } else {
          console.error('Failed to list tmux sessions', error);
          stdout = '';
        }
      }

      const names = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      const parsedSessions = names
        .map((name) => parseTmuxSessionName(name))
        .filter(Boolean);

      if (parsedSessions.length > 0) {
        let lookup;
        try {
          const structure = await discoverRepositories(workdir);
          lookup = buildSanitisedWorktreeLookup(structure);
        } catch (error) {
          lookup = new Map();
        }

        parsedSessions.forEach((parsed) => {
          const sanitisedKey = `${parsed.org}--${parsed.repo}--${parsed.branch}`;
          const actual = lookup.get(sanitisedKey);
          if (!actual) {
            return;
          }
          const key = makeSessionKey(actual.org, actual.repo, actual.branch);
          if (seenKeys.has(key)) {
            return;
          }
          sessions.push({ org: actual.org, repo: actual.repo, branch: actual.branch });
          seenKeys.add(key);
        });
      }
    }

    sendJson(context.res, 200, { sessions });
  }

  return { list };
}
