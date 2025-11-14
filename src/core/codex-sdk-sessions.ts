import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  Codex,
  type Thread,
  type ThreadOptions,
  type ThreadEvent,
  type ThreadStartedEvent,
  type TurnCompletedEvent,
  type TurnFailedEvent,
  type ItemStartedEvent,
  type ItemUpdatedEvent,
  type ItemCompletedEvent,
  type CommandExecutionItem,
} from '@openai/codex-sdk';
import { getWorktreePath } from './git.js';
import {
  listStoredSessions,
  writeStoredSession,
  deleteStoredSession,
  type CodexSdkStoredSession,
} from './codex-sdk-storage.js';
import type { CodexSdkEvent, CodexSdkSessionSummary } from '../types/codex-sdk.js';

interface CodexSession {
  id: string;
  org: string;
  repo: string;
  branch: string;
  worktreePath: string;
  label: string;
  createdAt: string;
  lastActivityAt: string | null;
  threadId: string | null;
  thread: Thread | null;
  history: CodexSdkEvent[];
  emitter: EventEmitter;
  pendingTurn: Promise<void> | null;
  persistPromise: Promise<void> | null;
  commandOutputByItemId: Map<string, string>;
}

interface CodexSessionDependencies {
  codexFactory: () => Codex;
  getWorktreePath: typeof getWorktreePath;
  randomUUID: typeof randomUUID;
  now: () => Date;
  createEventEmitter: () => EventEmitter;
  listStoredSessions: typeof listStoredSessions;
  writeStoredSession: typeof writeStoredSession;
  deleteStoredSession: typeof deleteStoredSession;
  isVerboseLoggingEnabled: () => boolean;
}

const defaultDependencies: CodexSessionDependencies = {
  codexFactory: () => new Codex(),
  getWorktreePath,
  randomUUID,
  now: () => new Date(),
  createEventEmitter: () => new EventEmitter(),
  listStoredSessions,
  writeStoredSession,
  deleteStoredSession,
  isVerboseLoggingEnabled: () => {
    const value = process.env['CODEX_SDK_VERBOSE'];
    if (!value) {
      return false;
    }
    const normalised = value.trim().toLowerCase();
    return normalised === '1' || normalised === 'true' || normalised === 'yes' || normalised === 'on';
  },
};

let dependencyOverrides: Partial<CodexSessionDependencies> | null = null;
let codexInstance: Codex | null = null;

function getDependency<K extends keyof CodexSessionDependencies>(key: K): CodexSessionDependencies[K] {
  return (dependencyOverrides?.[key] ?? defaultDependencies[key]) as CodexSessionDependencies[K];
}

function getCodexInstance(): Codex {
  if (!codexInstance) {
    const factory = getDependency('codexFactory');
    codexInstance = factory();
  }
  return codexInstance;
}

const sessionsById = new Map<string, CodexSession>();
const worktreeHydration = new Set<string>();

function makeWorktreeKey(workdir: string, org: string, repo: string, branch: string): string {
  return `${workdir}::${org}/${repo}/${branch}`;
}

function timestamp(): string {
  return getDependency('now')().toISOString();
}

function createErrorEvent(error: unknown): CodexSdkEvent {
  const message =
    (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
      ? error.message
      : null) || 'Codex SDK request failed';
  return {
    type: 'error',
    message,
    timestamp: timestamp(),
  };
}

function createLogEvent(message: string, level: 'info' | 'warn' | 'error' = 'info'): CodexSdkEvent {
  return {
    type: 'log',
    level,
    message,
    timestamp: timestamp(),
  };
}

function emitEvent(session: CodexSession, event: CodexSdkEvent): void {
  session.history.push(event);
  session.lastActivityAt = event.timestamp;
  session.emitter.emit('event', event);
  schedulePersist(session);
}

function emitVerboseLog(session: CodexSession, message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  if (!getDependency('isVerboseLoggingEnabled')()) {
    return;
  }
  emitEvent(session, createLogEvent(message, level));
}

function createUserEvent(text: string): CodexSdkEvent {
  return {
    type: 'user_message',
    id: getDependency('randomUUID')(),
    text,
    timestamp: timestamp(),
  };
}

function createThinkingEvent(
  item: { id?: string; text?: string },
  status: 'started' | 'updated' | 'completed',
): CodexSdkEvent {
  return {
    type: 'thinking',
    id: item.id || getDependency('randomUUID')(),
    text: typeof item.text === 'string' ? item.text : '',
    status,
    timestamp: timestamp(),
  };
}

function createResponseEvent(item: { id?: string; text?: string }): CodexSdkEvent {
  return {
    type: 'agent_response',
    id: item.id || getDependency('randomUUID')(),
    text: typeof item.text === 'string' ? item.text : '',
    timestamp: timestamp(),
  };
}

function createUsageEvent(event: TurnCompletedEvent): CodexSdkEvent {
  return {
    type: 'usage',
    usage: event.usage,
    timestamp: timestamp(),
  };
}

function getSessionOrThrow(sessionId: string): CodexSession {
  const session = sessionsById.get(sessionId);
  if (!session) {
    throw new Error('Codex SDK session not found');
  }
  return session;
}

function schedulePersist(session: CodexSession): void {
  const persist = async () => {
    await getDependency('writeStoredSession')(session.worktreePath, {
      sessionId: session.id,
      org: session.org,
      repo: session.repo,
      branch: session.branch,
      label: session.label,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      threadId: session.threadId,
      events: session.history,
    });
  };

  const next = (session.persistPromise ?? Promise.resolve()).then(persist).catch((error) => {
    console.warn('[agentrix] Failed to persist Codex SDK transcript:', error);
  });

  session.persistPromise = next.finally(() => {
    if (session.persistPromise === next) {
      session.persistPromise = null;
    }
  });
}

function handleItemEvent(session: CodexSession, event: ItemStartedEvent | ItemUpdatedEvent | ItemCompletedEvent): void {
  const item = event.item;
  if (!item || typeof item !== 'object') {
    return;
  }
  if (item.type === 'reasoning') {
    const status =
      event.type === 'item.completed' ? 'completed' : event.type === 'item.updated' ? 'updated' : 'started';
    emitEvent(session, createThinkingEvent(item, status));
    return;
  }
  if (item.type === 'agent_message' && event.type === 'item.completed') {
    emitEvent(session, createResponseEvent(item));
    return;
  }
  handleVerboseItemEvent(session, event);
}

function describeCommandExecution(item: Partial<CommandExecutionItem>): string {
  const commandText = typeof item.command === 'string' && item.command.trim().length > 0 ? item.command.trim() : 'shell command';
  const exitCode = typeof item.exit_code === 'number' ? item.exit_code : null;
  const status = typeof item.status === 'string' ? item.status : null;
  if (exitCode !== null) {
    return `${commandText} exited with code ${exitCode}`;
  }
  if (status) {
    return `${commandText} ${status.replace(/_/g, ' ')}`.trim();
  }
  return `Running ${commandText}`;
}

function handleVerboseItemEvent(session: CodexSession, event: ItemStartedEvent | ItemUpdatedEvent | ItemCompletedEvent): void {
  if (!getDependency('isVerboseLoggingEnabled')()) {
    return;
  }
  const item = event.item as { type?: string; id?: string; aggregated_output?: string; command?: string; exit_code?: number; status?: string; message?: string };
  if (!item || typeof item !== 'object') {
    return;
  }
  if (item.type === 'command_execution') {
    const id = typeof item.id === 'string' && item.id.length > 0 ? item.id : getDependency('randomUUID')();
    if (event.type === 'item.started') {
      session.commandOutputByItemId.set(id, '');
      emitVerboseLog(session, `Running command: ${typeof item.command === 'string' ? item.command : 'shell command'}`);
    }
    const aggregated = typeof item.aggregated_output === 'string' ? item.aggregated_output : '';
    if (aggregated) {
      const previous = session.commandOutputByItemId.get(id) ?? '';
      if (aggregated.length > previous.length) {
        const delta = aggregated.slice(previous.length);
        if (delta.length > 0) {
          emitVerboseLog(session, delta);
        }
      }
      session.commandOutputByItemId.set(id, aggregated);
    }
    if (event.type === 'item.completed') {
      emitVerboseLog(session, describeCommandExecution(item as CommandExecutionItem));
      session.commandOutputByItemId.delete(id);
    }
    return;
  }
  if (item.type === 'error' && typeof item.message === 'string') {
    emitVerboseLog(session, `Agent error: ${item.message}`, 'error');
  }
}

function handleTurnEvent(session: CodexSession, event: TurnCompletedEvent | TurnFailedEvent | ThreadEvent): void {
  if (event.type === 'turn.completed') {
    emitEvent(session, createUsageEvent(event));
    return;
  }
  if (event.type === 'turn.failed') {
    emitEvent(session, createErrorEvent(event.error));
    emitVerboseLog(
      session,
      `Codex turn failed: ${
        event.error && typeof event.error.message === 'string' ? event.error.message : 'Unknown error'
      }`,
      'error',
    );
    return;
  }
  if (event.type === 'error') {
    emitEvent(session, createErrorEvent({ message: event.message }));
    emitVerboseLog(session, `Codex stream error: ${event.message}`, 'error');
  }
}

function handleThreadStartedEvent(session: CodexSession, event: ThreadStartedEvent): void {
  if (typeof event.thread_id === 'string' && event.thread_id.length > 0) {
    session.threadId = event.thread_id;
    schedulePersist(session);
    emitVerboseLog(session, `Thread established (${event.thread_id})`);
  }
}

async function processThreadEvent(session: CodexSession, event: ThreadEvent): Promise<void> {
  switch (event.type) {
    case 'item.started':
    case 'item.updated':
    case 'item.completed':
      handleItemEvent(session, event as ItemStartedEvent | ItemUpdatedEvent | ItemCompletedEvent);
      break;
    case 'thread.started':
      handleThreadStartedEvent(session, event as ThreadStartedEvent);
      break;
    case 'turn.completed':
    case 'turn.failed':
    case 'error':
      handleTurnEvent(session, event as TurnCompletedEvent | TurnFailedEvent | ThreadEvent);
      break;
    default:
      break;
  }
}

async function runStreamedTurn(session: CodexSession, input: string): Promise<void> {
  const { events } = await ensureThread(session).runStreamed(input);
  for await (const event of events) {
    await processThreadEvent(session, event);
  }
}

function ensureThread(session: CodexSession): Thread {
  if (session.thread) {
    if (!session.threadId && session.thread.id) {
      session.threadId = session.thread.id;
      schedulePersist(session);
    }
    return session.thread;
  }
  const codex = getCodexInstance();
  if (session.threadId) {
    session.thread = codex.resumeThread(session.threadId, {
      workingDirectory: session.worktreePath,
    });
  } else {
    session.thread = codex.startThread({
      workingDirectory: session.worktreePath,
      model: 'gpt-5.1-codex',
      modelReasoningEffort: 'high',
    });
  }
  session.threadId = session.thread.id;
  return session.thread;
}

function createSessionFromStored(record: CodexSdkStoredSession, worktreePath: string): CodexSession {
  const session: CodexSession = {
    id: record.sessionId,
    org: record.org,
    repo: record.repo,
    branch: record.branch,
    worktreePath,
    label: record.label,
    createdAt: record.createdAt,
    lastActivityAt: record.lastActivityAt,
    threadId: record.threadId,
    thread: null,
  history: [...record.events],
  emitter: getDependency('createEventEmitter')(),
  pendingTurn: null,
  persistPromise: null,
  commandOutputByItemId: new Map(),
};
  sessionsById.set(session.id, session);
  return session;
}

async function hydrateWorktree(workdir: string, worktreePath: string, org: string, repo: string, branch: string) {
  const key = makeWorktreeKey(workdir, org, repo, branch);
  if (worktreeHydration.has(key)) {
    return;
  }
  const stored = await getDependency('listStoredSessions')(worktreePath);
  stored.forEach((record) => {
    if (!record.sessionId || sessionsById.has(record.sessionId)) {
      return;
    }
    createSessionFromStored(record, worktreePath);
  });
  worktreeHydration.add(key);
}

export async function listCodexSdkSessions({
  workdir,
  org,
  repo,
  branch,
}: {
  workdir: string;
  org: string;
  repo: string;
  branch: string;
}): Promise<CodexSdkSessionSummary[]> {
  const { worktreePath } = await getDependency('getWorktreePath')(workdir, org, repo, branch);
  await hydrateWorktree(workdir, worktreePath, org, repo, branch);
  const sessions = Array.from(sessionsById.values()).filter(
    (session) =>
      session.org === org &&
      session.repo === repo &&
      session.branch === branch &&
      session.worktreePath === worktreePath,
  );
  return sessions.map(toSummary).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function createCodexSdkSession({
  workdir,
  org,
  repo,
  branch,
  label,
  threadOptions,
}: {
  workdir: string;
  org: string;
  repo: string;
  branch: string;
  label?: string;
  threadOptions?: ThreadOptions;
}): Promise<{ summary: CodexSdkSessionSummary; events: CodexSdkEvent[] }> {
  const { worktreePath } = await getDependency('getWorktreePath')(workdir, org, repo, branch);
  const sessionId = getDependency('randomUUID')();
  const nowIso = timestamp();
  const session: CodexSession = {
    id: sessionId,
    org,
    repo,
    branch,
    worktreePath,
    label: label && label.trim().length > 0 ? label.trim() : `Codex Session`,
    createdAt: nowIso,
    lastActivityAt: nowIso,
    threadId: null,
    thread: null,
    history: [],
    emitter: getDependency('createEventEmitter')(),
    pendingTurn: null,
    persistPromise: null,
    commandOutputByItemId: new Map(),
  };
  sessionsById.set(sessionId, session);
  schedulePersist(session);


  // Start thread immediately so first message is quick.
  session.thread = getCodexInstance().startThread({
    workingDirectory: worktreePath,
    model: 'gpt-5.1-codex',
    modelReasoningEffort: 'high',
    ...(threadOptions || {}),
  });
  session.threadId = session.thread.id;

  return { summary: toSummary(session), events: session.history }; 
}

export function getCodexSdkSessionDetails(sessionId: string): { summary: CodexSdkSessionSummary; events: CodexSdkEvent[] } | null {
  const session = sessionsById.get(sessionId);
  if (!session) {
    return null;
  }
  return { summary: toSummary(session), events: session.history };
}

export async function deleteCodexSdkSession(sessionId: string): Promise<void> {
  const session = sessionsById.get(sessionId);
  if (!session) {
    return;
  }
  sessionsById.delete(sessionId);
  await getDependency('deleteStoredSession')(session.worktreePath, sessionId);
}

export function getCodexSdkSession(sessionId: string): CodexSdkSessionSummary | null {
  const session = sessionsById.get(sessionId);
  return session ? toSummary(session) : null;
}

export function getCodexSdkSessionEvents(sessionId: string): CodexSdkEvent[] {
  return getSessionOrThrow(sessionId).history;
}

export async function sendCodexSdkUserMessage(sessionId: string, text: string): Promise<void> {
  const session = getSessionOrThrow(sessionId);
  const normalised = typeof text === 'string' ? text.trim() : '';
  if (!normalised) {
    throw new Error('Message cannot be empty');
  }
  emitEvent(session, createUserEvent(normalised));

  const turn = async () => {
    try {
      await runStreamedTurn(session, normalised);
    } catch (error: unknown) {
      emitEvent(session, createErrorEvent(error));
      throw error;
    }
  };

  const previous = session.pendingTurn ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(turn)
    .catch(() => {})
    .finally(() => {
      if (session.pendingTurn === next) {
        session.pendingTurn = null;
      }
    });
  session.pendingTurn = next;
}

export function subscribeToCodexSdkEvents(
  sessionId: string,
  handler: (event: CodexSdkEvent) => void,
): () => void {
  const session = getSessionOrThrow(sessionId);
  const listener = (event: CodexSdkEvent) => handler(event);
  session.emitter.on('event', listener);
  return () => session.emitter.off('event', listener);
}

function toSummary(session: CodexSession): CodexSdkSessionSummary {
  return {
    id: session.id,
    org: session.org,
    repo: session.repo,
    branch: session.branch,
    label: session.label,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
  };
}

export function __setCodexSdkSessionOverrides(overrides?: Partial<CodexSessionDependencies>): void {
  dependencyOverrides = overrides ?? null;
  codexInstance = null;
}

export function resetCodexSdkSessions(): void {
  sessionsById.clear();
  worktreeHydration.clear();
  codexInstance = null;
}
