import {
  getOrCreateTerminalSession,
  getSessionById,
  queueSessionInput,
  disposeSessionById,
} from '../core/terminal-sessions.js';
import { launchAgentProcess } from '../core/agents.js';
import { ValidationError } from '../infrastructure/errors/index.js';
import type { TerminalOpenInput, TerminalSendInput, TerminalCloseInput } from '../validation/index.js';
import type { ITerminalService } from '../types/services.js';

export interface TerminalOpenResult {
  sessionId: string;
  log: string;
  closed: boolean;
  created: boolean;
}

export interface TerminalSendResult {
  ok: boolean;
}

export interface TerminalCloseResult {
  ok: boolean;
}

type TerminalServiceDependencyOverrides = Partial<{
  getOrCreateTerminalSession: typeof getOrCreateTerminalSession;
  getSessionById: typeof getSessionById;
  queueSessionInput: typeof queueSessionInput;
  launchAgentProcess: typeof launchAgentProcess;
  disposeSessionById: typeof disposeSessionById;
}>;

const terminalServiceDependencies = {
  getOrCreateTerminalSession,
  getSessionById,
  queueSessionInput,
  launchAgentProcess,
  disposeSessionById,
} as const;

let terminalServiceTestOverrides: TerminalServiceDependencyOverrides | null = null;

function resolveTerminalServiceDependency<K extends keyof typeof terminalServiceDependencies>(
  key: K
): (typeof terminalServiceDependencies)[K] {
  const overrides = terminalServiceTestOverrides || {};
  const override = overrides[key];
  if (override) {
    return override as (typeof terminalServiceDependencies)[K];
  }
  return terminalServiceDependencies[key];
}

export function __setTerminalServiceTestOverrides(overrides?: TerminalServiceDependencyOverrides): void {
  terminalServiceTestOverrides = overrides ?? null;
}

/**
 * Service for terminal session orchestration
 */
export class TerminalService implements ITerminalService {
  private readonly mode: string;

  constructor(private readonly workdir: string, options: { mode?: string } = {}) {
    this.mode = typeof options.mode === 'string' ? options.mode : 'auto';
  }

  /**
   * Opens or creates a terminal session
   * @param params - Session parameters
   * @returns Session information
   */
  async openTerminal(params: TerminalOpenInput): Promise<TerminalOpenResult> {
    const {
      org,
      repo,
      branch,
      command = '',
      hasPrompt,
      prompt,
      sessionId,
      newSession,
      sessionTool,
    } = params;

    if (branch.toLowerCase() === 'main') {
      throw new ValidationError('Terminal access to the main branch is disabled');
    }

    if (sessionId && newSession) {
      throw new ValidationError('sessionId cannot be combined with newSession');
    }

    if (hasPrompt && sessionId) {
      throw new ValidationError('sessionId cannot be combined with prompt launches');
    }

    if (hasPrompt && newSession) {
      throw new ValidationError('newSession cannot be combined with prompt launches');
    }

    const attachSessionId = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (attachSessionId) {
      const getSession = resolveTerminalServiceDependency('getSessionById');
      const session = getSession(attachSessionId);
      if (!session || session.closed) {
        throw new ValidationError('Terminal session not found');
      }
      if (session.org !== org || session.repo !== repo || session.branch !== branch) {
        throw new ValidationError('Requested session does not belong to the worktree');
      }
      if (command) {
        const commandInput = /[\r\n]$/.test(command) ? command : `${command}\r`;
        const queueInput = resolveTerminalServiceDependency('queueSessionInput');
        queueInput(session, commandInput);
      }
      return {
        sessionId: session.id,
        log: session.log || '',
        closed: Boolean(session.closed),
        created: false,
      };
    }

    if (hasPrompt) {
      if (!command) {
        throw new ValidationError('command must be provided when prompt is included');
      }

      const launch = resolveTerminalServiceDependency('launchAgentProcess');
      const { sessionId, createdSession } = await launch({
        command,
        workdir: this.workdir,
        org,
        repo,
        branch,
        prompt: prompt ?? '',
      });

      const getSession = resolveTerminalServiceDependency('getSessionById');
      const session = getSession(sessionId);
      if (!session) {
        throw new Error('Terminal session not found after launch');
      }

      return {
        sessionId,
        log: session.log || '',
        closed: Boolean(session.closed),
        created: Boolean(createdSession),
      };
    }

    const desiredTool = sessionTool === 'agent' ? 'agent' : 'terminal';
    const getOrCreate = resolveTerminalServiceDependency('getOrCreateTerminalSession');
    const result = await getOrCreate(this.workdir, org, repo, branch, {
      mode: this.mode,
      forceNew: Boolean(newSession),
      tool: desiredTool,
    });

    const session = 'session' in result ? result.session : result;
    const created = 'created' in result ? result.created : false;

    if (command) {
      const commandInput = /[\r\n]$/.test(command) ? command : `${command}\r`;
      const queueInput = resolveTerminalServiceDependency('queueSessionInput');
      queueInput(session, commandInput);
    }

    return {
      sessionId: session.id,
      log: session.log || '',
      closed: Boolean(session.closed),
      created,
    };
  }

  /**
   * Sends input to a terminal session
   * @param params - Input parameters
   * @returns Success result
   */
  async sendInput(params: TerminalSendInput): Promise<TerminalSendResult> {
    const { sessionId, input } = params;
    const getSession = resolveTerminalServiceDependency('getSessionById');
    const queueInput = resolveTerminalServiceDependency('queueSessionInput');
    const session = getSession(sessionId);
    
    if (!session || session.closed) {
      throw new ValidationError('Terminal session not found');
    }

    queueInput(session, input);
    return { ok: true };
  }

  /**
   * Closes a terminal session
   * @param params - Close parameters
   * @returns Success result
   */
  async closeSession(params: TerminalCloseInput): Promise<TerminalCloseResult> {
    const { sessionId } = params;
    if (!sessionId) {
      throw new ValidationError('sessionId is required');
    }
    const dispose = resolveTerminalServiceDependency('disposeSessionById');
    await dispose(sessionId);
    return { ok: true };
  }
}

/**
 * Creates a terminal service instance
 * @param workdir - Work directory root
 * @param options - Service options
 * @returns TerminalService instance
 */
export function createTerminalService(workdir: string, options: { mode?: string } = {}): TerminalService {
  return new TerminalService(workdir, options);
}
