import { discoverRepositories } from '../repositories/repository-repository.js';
import {
  buildSanitisedWorktreeLookup,
  detectTmux,
  isTmuxAvailable,
  parseTmuxSessionName,
  runTmux,
} from '../core/tmux.js';
import { listActiveSessions, makeSessionKey, serialiseSessions } from '../core/terminal-sessions.js';
import type { TerminalSessionSnapshot } from '../types/terminal.js';

export interface SessionInfo {
  org: string;
  repo: string;
  branch: string;
  idle: boolean;
  lastActivityAt: string | null;
  sessions: TerminalSessionSnapshot[];
}

type SessionServiceDependencyOverrides = Partial<{
  discoverRepositories: typeof discoverRepositories;
  buildSanitisedWorktreeLookup: typeof buildSanitisedWorktreeLookup;
  detectTmux: typeof detectTmux;
  isTmuxAvailable: typeof isTmuxAvailable;
  parseTmuxSessionName: typeof parseTmuxSessionName;
  runTmux: typeof runTmux;
  listActiveSessions: typeof listActiveSessions;
  makeSessionKey: typeof makeSessionKey;
  serialiseSessions: typeof serialiseSessions;
}>;

const sessionServiceDependencies = {
  discoverRepositories,
  buildSanitisedWorktreeLookup,
  detectTmux,
  isTmuxAvailable,
  parseTmuxSessionName,
  runTmux,
  listActiveSessions,
  makeSessionKey,
  serialiseSessions,
} as const;

let sessionServiceTestOverrides: SessionServiceDependencyOverrides | null = null;

function resolveSessionServiceDependency<K extends keyof typeof sessionServiceDependencies>(
  key: K
): (typeof sessionServiceDependencies)[K] {
  const overrides = sessionServiceTestOverrides || {};
  const override = overrides[key];
  if (override) {
    return override as (typeof sessionServiceDependencies)[K];
  }
  return sessionServiceDependencies[key];
}

export function __setSessionServiceTestOverrides(overrides?: SessionServiceDependencyOverrides): void {
  sessionServiceTestOverrides = overrides ?? null;
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
    const sessionLookup = new Map<
      string,
      {
        summary: SessionInfo;
        lastActivityAtMs: number | null;
      }
    >();

    const listSessionsFn = resolveSessionServiceDependency('listActiveSessions');
    const serialise = resolveSessionServiceDependency('serialiseSessions');
    const makeKey = resolveSessionServiceDependency('makeSessionKey');

    const summaries = serialise(listSessionsFn());

    summaries.forEach((entry) => {
      if (!entry || !entry.org || !entry.repo || !entry.branch) {
        return;
      }
      const key = makeKey(entry.org, entry.repo, entry.branch);
      const lastActivityAtMs =
        typeof entry.lastActivityAt === 'string' ? Date.parse(entry.lastActivityAt) : null;
      const sessions = Array.isArray(entry.sessions) ? entry.sessions : [];
      sessionLookup.set(key, {
        summary: {
          org: entry.org,
          repo: entry.repo,
          branch: entry.branch,
          idle: Boolean(entry.idle),
          lastActivityAt: entry.lastActivityAt ?? null,
          sessions,
        },
        lastActivityAtMs: Number.isNaN(lastActivityAtMs) ? null : lastActivityAtMs,
      });
    });

    // Discover orphaned tmux sessions
    const detect = resolveSessionServiceDependency('detectTmux');
    const tmuxAvailable = resolveSessionServiceDependency('isTmuxAvailable');

    await detect();
    if (tmuxAvailable()) {
      const tmuxSessions = await this.discoverTmuxSessions();
      
      if (tmuxSessions.length > 0) {
        let lookup;
        try {
          const repositoryDiscovery = resolveSessionServiceDependency('discoverRepositories');
          const buildLookup = resolveSessionServiceDependency('buildSanitisedWorktreeLookup');
          const structure = await repositoryDiscovery(this.workdir);
          lookup = buildLookup(structure);
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
            summary: {
              org: actual.org,
              repo: actual.repo,
              branch: actual.branch,
              idle: false,
              lastActivityAt: null,
              sessions: [],
            },
            lastActivityAtMs: null,
          });
        });
      }
    }

    // Convert to output format
    return Array.from(sessionLookup.values()).map(({ summary, lastActivityAtMs }) => ({
      ...summary,
      lastActivityAt: isFiniteNumber(lastActivityAtMs)
        ? new Date(lastActivityAtMs).toISOString()
        : summary.lastActivityAt,
    }));
  }

  /**
   * Discovers tmux sessions
   * @returns List of parsed tmux session names
   */
  private async discoverTmuxSessions(): Promise<Array<{ org: string; repo: string; branch: string }>> {
    let stdout = '';
    const run = resolveSessionServiceDependency('runTmux');
    try {
      const result = await run(['list-sessions', '-F', '#S']);
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

    const parse = resolveSessionServiceDependency('parseTmuxSessionName');

    return names
      .map((name) => parse(name))
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
