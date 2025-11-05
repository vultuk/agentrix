import { discoverRepositories } from '../repositories/repository-repository.js';
import {
  buildSanitisedWorktreeLookup,
  detectTmux,
  isTmuxAvailable,
  parseTmuxSessionName,
  runTmux,
} from '../core/tmux.js';
import { listActiveSessions, makeSessionKey } from '../core/terminal-sessions.js';

export interface SessionInfo {
  org: string;
  repo: string;
  branch: string;
  idle: boolean;
  lastActivityAt: string | null;
}

/**
 * Type guard for finite numbers
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Service for session discovery and management
 */
export class SessionService {
  constructor(private readonly workdir: string) {}

  /**
   * Lists all active terminal sessions, including both in-memory and orphaned tmux sessions
   * @returns List of session information
   */
  async listSessions(): Promise<SessionInfo[]> {
    const sessionLookup = new Map<string, {
      org: string;
      repo: string;
      branch: string;
      idle: boolean;
      lastActivityAtMs: number | null;
    }>();

    // Gather in-memory sessions
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

    // Discover orphaned tmux sessions
    await detectTmux();
    if (isTmuxAvailable()) {
      const tmuxSessions = await this.discoverTmuxSessions();
      
      if (tmuxSessions.length > 0) {
        let lookup;
        try {
          const structure = await discoverRepositories(this.workdir);
          lookup = buildSanitisedWorktreeLookup(structure);
        } catch (error: unknown) {
          lookup = new Map();
        }

        tmuxSessions.forEach((parsed) => {
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

    // Convert to output format
    return Array.from(sessionLookup.values()).map((entry) => ({
      org: entry.org,
      repo: entry.repo,
      branch: entry.branch,
      idle: Boolean(entry.idle),
      lastActivityAt: isFiniteNumber(entry.lastActivityAtMs)
        ? new Date(entry.lastActivityAtMs).toISOString()
        : null,
    }));
  }

  /**
   * Discovers tmux sessions
   * @returns List of parsed tmux session names
   */
  private async discoverTmuxSessions(): Promise<Array<{ org: string; repo: string; branch: string }>> {
    let stdout = '';
    try {
      const result = await runTmux(['list-sessions', '-F', '#S']);
      stdout = result && typeof result.stdout === 'string' ? result.stdout : '';
    } catch (error: unknown) {
      const err = error as { code?: number };
      if (typeof err.code === 'number') {
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

    return names
      .map((name) => parseTmuxSessionName(name))
      .filter((parsed): parsed is NonNullable<typeof parsed> => parsed !== null);
  }
}

/**
 * Creates a session service instance
 * @param workdir - Work directory root
 * @returns SessionService instance
 */
export function createSessionService(workdir: string): SessionService {
  return new SessionService(workdir);
}

