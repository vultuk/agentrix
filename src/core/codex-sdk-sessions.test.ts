import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import type { ThreadEvent } from '@openai/codex-sdk';
import {
  createCodexSdkSession,
  listCodexSdkSessions,
  getCodexSdkSessionEvents,
  deleteCodexSdkSession,
  sendCodexSdkUserMessage,
  resetCodexSdkSessions,
  __setCodexSdkSessionOverrides,
} from './codex-sdk-sessions.js';

function createThread(events: ThreadEvent[]) {
  const calls: string[] = [];
  const thread = {
    id: null,
    runStreamed: async (input: string) => {
      calls.push(input);
      async function* iterator() {
        for (const event of events) {
          yield event;
        }
      }
      return { events: iterator() };
    },
  };
  return { thread, calls };
}

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
}

describe('codex-sdk-sessions', () => {
  beforeEach(() => {
    mock.restoreAll();
    resetCodexSdkSessions();
    __setCodexSdkSessionOverrides();
  });

  afterEach(() => {
    mock.restoreAll();
    resetCodexSdkSessions();
    __setCodexSdkSessionOverrides();
  });

  it('creates a new Codex session without seed events', async () => {
    const { thread } = createThread([]);
    const startThreadMock = mock.fn(() => thread);
    const writeMock = mock.fn(async () => {});
    __setCodexSdkSessionOverrides({
      codexFactory: () => ({ startThread: startThreadMock } as never),
      getWorktreePath: async () => ({ worktreePath: '/tmp/worktrees/acme-demo' }),
      randomUUID: () => 'session-1',
      now: () => new Date('2024-02-01T00:00:00.000Z'),
      createEventEmitter: () => new EventEmitter(),
      listStoredSessions: async () => [],
      writeStoredSession: writeMock,
      deleteStoredSession: async () => {},
      isVerboseLoggingEnabled: () => false,
    });

    const result = await createCodexSdkSession({
      workdir: '/tmp',
      org: 'acme',
      repo: 'demo',
      branch: 'main',
    });

    assert.equal(result.summary.id, 'session-1');
    assert.equal(result.summary.label, 'Codex Session');
    assert.equal(result.events.length, 0);
    assert.equal(startThreadMock.mock.callCount(), 1);
    assert.deepEqual(startThreadMock.mock.calls[0]?.arguments[0], {
      workingDirectory: '/tmp/worktrees/acme-demo',
      model: 'gpt-5.1-codex',
      modelReasoningEffort: 'high',
    });

    await flushAsync();
    assert.equal(writeMock.mock.callCount(), 1);
  });

  it('hydrates persisted sessions when listing a worktree', async () => {
    __setCodexSdkSessionOverrides({
      codexFactory: () => ({ startThread: () => ({}) } as never),
      getWorktreePath: async () => ({ worktreePath: '/tmp/worktrees/acme-demo' }),
      randomUUID: () => 'session-1',
      now: () => new Date('2024-02-01T00:00:00.000Z'),
      createEventEmitter: () => new EventEmitter(),
      listStoredSessions: async () => [
        {
          sessionId: 'stored-1',
          org: 'acme',
          repo: 'demo',
          branch: 'main',
          label: 'Stored Session',
          createdAt: '2024-01-01T00:00:00.000Z',
          lastActivityAt: '2024-01-01T01:00:00.000Z',
          threadId: 'thread-123',
          events: [{ type: 'ready', message: 'restored', timestamp: '2024-01-01T00:00:00.000Z' }],
        },
      ],
      writeStoredSession: async () => {},
      deleteStoredSession: async () => {},
      isVerboseLoggingEnabled: () => false,
    });

    const summaries = await listCodexSdkSessions({
      workdir: '/tmp',
      org: 'acme',
      repo: 'demo',
      branch: 'main',
    });

    assert.equal(summaries.length, 1);
    assert.equal(summaries[0]?.id, 'stored-1');
    const history = getCodexSdkSessionEvents('stored-1');
    assert.equal(history.length, 1);
    assert.equal(history[0]?.type, 'ready');
  });

  it('streams Codex events for user messages', async () => {
    const events: ThreadEvent[] = [
      { type: 'thread.started', thread_id: 'thread-001' },
      {
        type: 'item.started',
        item: { id: 'thinking-1', type: 'reasoning', text: 'Analysing' },
      },
      {
        type: 'item.updated',
        item: { id: 'thinking-1', type: 'reasoning', text: 'Still thinking' },
      },
      {
        type: 'item.completed',
        item: { id: 'msg-1', type: 'agent_message', text: 'Proposed change' },
      },
      {
        type: 'turn.completed',
        usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 20 },
      },
    ];
    const { thread } = createThread(events);
    const startThreadMock = mock.fn(() => thread);
    const getWorktreePathMock = mock.fn(async () => ({ worktreePath: '/tmp/worktrees/acme-demo' }));
    __setCodexSdkSessionOverrides({
      codexFactory: () => ({ startThread: startThreadMock } as never),
      getWorktreePath: getWorktreePathMock,
      randomUUID: (() => {
        let counter = 0;
        return () => `uuid-${++counter}`;
      })(),
      now: () => new Date('2024-02-01T00:00:00.000Z'),
      createEventEmitter: () => new EventEmitter(),
      listStoredSessions: async () => [],
      writeStoredSession: async () => {},
      deleteStoredSession: async () => {},
      isVerboseLoggingEnabled: () => false,
    });

    const session = await createCodexSdkSession({
      workdir: '/tmp',
      org: 'acme',
      repo: 'demo',
      branch: 'feature/sdk',
    });

    await sendCodexSdkUserMessage(session.summary.id, 'Fix the failing tests');
    await flushAsync();
    await flushAsync();

    const history = getCodexSdkSessionEvents(session.summary.id);
    const types = history.map((entry) => entry.type);
    assert.deepEqual(types, ['user_message', 'thinking', 'thinking', 'agent_response', 'usage']);
    assert.equal(history[0]?.type, 'user_message');
    assert.equal(history[0]?.text, 'Fix the failing tests');
    assert.equal(history[3]?.type, 'agent_response');
    assert.equal(history[3]?.text, 'Proposed change');
  });

  it('emits verbose command logs when enabled', async () => {
    const events: ThreadEvent[] = [
      { type: 'thread.started', thread_id: 'thread-123' },
      {
        type: 'item.started',
        item: { id: 'cmd-1', type: 'command_execution', command: 'npm test', aggregated_output: '' },
      },
      {
        type: 'item.updated',
        item: {
          id: 'cmd-1',
          type: 'command_execution',
          command: 'npm test',
          aggregated_output: 'Running tests...',
        },
      },
      {
        type: 'item.completed',
        item: {
          id: 'cmd-1',
          type: 'command_execution',
          command: 'npm test',
          aggregated_output: 'Running tests...\nDone!',
          exit_code: 0,
        },
      },
    ];
    const { thread } = createThread(events);
    __setCodexSdkSessionOverrides({
      codexFactory: () => ({ startThread: () => thread } as never),
      getWorktreePath: async () => ({ worktreePath: '/tmp/worktrees/acme-demo' }),
      randomUUID: (() => {
        let counter = 0;
        return () => `uuid-${++counter}`;
      })(),
      now: () => new Date('2024-02-01T00:00:00.000Z'),
      createEventEmitter: () => new EventEmitter(),
      listStoredSessions: async () => [],
      writeStoredSession: async () => {},
      deleteStoredSession: async () => {},
      isVerboseLoggingEnabled: () => true,
    });

    const session = await createCodexSdkSession({
      workdir: '/tmp',
      org: 'acme',
      repo: 'demo',
      branch: 'feature/sdk',
    });

    await sendCodexSdkUserMessage(session.summary.id, 'Run the tests');
    await flushAsync();
    await flushAsync();

    const history = getCodexSdkSessionEvents(session.summary.id);
    const logMessages = history.filter((entry) => entry.type === 'log').map((entry) => entry.message);
    assert.ok(logMessages.some((message) => message?.includes('Running command: npm test')));
    assert.ok(logMessages.some((message) => message?.includes('Running tests...')));
    assert.ok(logMessages.some((message) => message?.includes('exited with code 0')));
  });

  it('deletes a Codex session and removes transcript', async () => {
    const deleteMock = mock.fn(async () => {});
    const { thread } = createThread([]);
    __setCodexSdkSessionOverrides({
      codexFactory: () => ({ startThread: () => thread } as never),
      getWorktreePath: async () => ({ worktreePath: '/tmp/worktrees/acme-demo' }),
      randomUUID: () => 'session-delete',
      now: () => new Date('2024-02-01T00:00:00.000Z'),
      createEventEmitter: () => new EventEmitter(),
      listStoredSessions: async () => [],
      writeStoredSession: async () => {},
      deleteStoredSession: deleteMock,
      isVerboseLoggingEnabled: () => false,
    });

    const result = await createCodexSdkSession({
      workdir: '/tmp',
      org: 'acme',
      repo: 'demo',
      branch: 'main',
    });

    await deleteCodexSdkSession(result.summary.id);
    assert.equal(deleteMock.mock.callCount(), 1);
    assert.equal(deleteMock.mock.calls[0]?.arguments[1], result.summary.id);
  });
});
