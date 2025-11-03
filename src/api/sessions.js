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

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

export function createSessionHandlers(workdir) {
  async function list(context) {
    if (context.method === 'HEAD') {
      context.res.statusCode = 200;
      context.res.setHeader('Cache-Control', 'no-store');
      context.res.end();
      return;
    }

    const sessionLookup = new Map();

    listActiveSessions().forEach((session) => {
      if (!session || !session.org || !session.repo || !session.branch) {
        return;
      }
      const key = makeSessionKey(session.org, session.repo, session.branch);
      const lastActivityAtMs =
        typeof session.lastActivityAt === 'number'
          ? session.lastActivityAt
          : session.lastActivityAt instanceof Date
          ? session.lastActivityAt.getTime()
          : null;
      const idle = Boolean(session.idle);
      const existing = sessionLookup.get(key);
      if (!existing) {
        sessionLookup.set(key, {
          org: session.org,
          repo: session.repo,
          branch: session.branch,
          idle,
          lastActivityAtMs,
        });
        return;
      }
      existing.idle = existing.idle && idle;
      if (
        isFiniteNumber(lastActivityAtMs) &&
        (!isFiniteNumber(existing.lastActivityAtMs) || lastActivityAtMs > existing.lastActivityAtMs)
      ) {
        existing.lastActivityAtMs = lastActivityAtMs;
      }
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
          if (sessionLookup.has(key)) {
            return;
          }
          sessionLookup.set(key, {
            org: actual.org,
            repo: actual.repo,
            branch: actual.branch,
            idle: false,
            lastActivityAtMs: null,
          });
        });
      }
    }

    const sessions = Array.from(sessionLookup.values()).map((entry) => ({
      org: entry.org,
      repo: entry.repo,
      branch: entry.branch,
      idle: Boolean(entry.idle),
      lastActivityAt: isFiniteNumber(entry.lastActivityAtMs)
        ? new Date(entry.lastActivityAtMs).toISOString()
        : null,
    }));

    sendJson(context.res, 200, { sessions });
  }

  return { list };
}
