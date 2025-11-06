import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
  emit,
  emitReposUpdate,
  emitSessionsUpdate,
  emitTasksUpdate,
  getEventTypes,
  on,
  onReposUpdate,
  onSessionsUpdate,
  onTasksUpdate,
  subscribeToEvents,
} from './event-bus.js';

describe('event-bus', () => {
  it('registers listeners and emits data', () => {
    const received: unknown[] = [];
    const unsubscribe = on('custom:event', (payload) => {
      received.push(payload);
    });

    emit('custom:event', { ok: true });
    emit('custom:event', 42);

    assert.deepEqual(received, [{ ok: true }, 42]);

    unsubscribe();
    emit('custom:event', 'after unsubscribe');
    assert.deepEqual(received, [{ ok: true }, 42]);
  });

  it('logs and continues when listener throws', () => {
    const consoleMock = mock.method(console, 'error', () => {});
    const received: unknown[] = [];

    const unsubscribe = on('custom:error', (payload) => {
      received.push(payload);
    });
    const unsubscribeThrowing = on('custom:error', () => {
      throw new Error('boom');
    });

    emit('custom:error', 'payload');

    assert.deepEqual(received, ['payload']);
    assert.equal(consoleMock.mock.calls.length, 1);

    unsubscribe();
    unsubscribeThrowing();
    consoleMock.mock.restore();
  });

  it('supports typed event helpers', () => {
    const repos: unknown[] = [];
    const sessions: unknown[] = [];
    const tasks: unknown[] = [];

    const unsubscribeRepos = onReposUpdate((payload) => repos.push(payload));
    const unsubscribeSessions = onSessionsUpdate((payload) => sessions.push(payload));
    const unsubscribeTasks = onTasksUpdate((payload) => tasks.push(payload));

    emitReposUpdate({ repos: 1 });
    emitSessionsUpdate({ sessions: 2 });
    emitTasksUpdate({ tasks: 3 });

    assert.deepEqual(repos, [{ repos: 1 }]);
    assert.deepEqual(sessions, [{ sessions: 2 }]);
    assert.deepEqual(tasks, [{ tasks: 3 }]);

    unsubscribeRepos();
    unsubscribeSessions();
    unsubscribeTasks();
  });

  it('exposes event types and subscription alias', () => {
    const types = getEventTypes();
    assert.deepEqual(types, {
      REPOS_UPDATE: 'repos:update',
      SESSIONS_UPDATE: 'sessions:update',
      TASKS_UPDATE: 'tasks:update',
    });

    let called = 0;
    const unsubscribe = subscribeToEvents(types.REPOS_UPDATE, () => {
      called += 1;
    });

    emitReposUpdate('data');
    assert.equal(called, 1);

    unsubscribe();
    emitReposUpdate('after unsubscribe');
    assert.equal(called, 1);
  });
});

