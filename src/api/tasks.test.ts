import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { createTaskHandlers } from './tasks.js';
import type { RequestContext } from '../types/http.js';

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  const url = new URL('http://localhost/api/tasks');
  if (overrides.url) {
    Object.assign(url, overrides.url);
  }

  return {
    req: { headers: {} } as unknown as RequestContext['req'],
    res: {
      statusCode: 0,
      setHeader: mock.fn(),
      getHeader: mock.fn(),
      end: mock.fn(),
    } as unknown as RequestContext['res'],
    url,
    method: 'GET',
    workdir: '/tmp/workdir',
    readJsonBody: async () => ({}),
    params: {},
    ...overrides,
  };
}

describe('createTaskHandlers', () => {
  it('list handler returns tasks', async () => {
    const handlers = createTaskHandlers({
      listTasks: () => [
        { id: 'task-1', name: 'First task' },
        { id: 'task-2', name: 'Second task' },
      ],
    });

    const context = createContext();

    await handlers.list(context);
    assert.equal(context.res.statusCode, 200);
    const endCall = (context.res.end as ReturnType<typeof mock.fn>).mock.calls[0];
    assert.ok(endCall);
    const body = JSON.parse(endCall.arguments[0] as string);
    assert.deepEqual(body, {
      tasks: [
        { id: 'task-1', name: 'First task' },
        { id: 'task-2', name: 'Second task' },
      ],
    });
  });

  it('read handler returns task by id parameter', async () => {
    const handlers = createTaskHandlers({
      getTaskById: (id: string) => ({ id, name: 'Example task' }),
    });

    const context = createContext({ params: { id: 'task-123' } });

    await handlers.read(context, '');
    assert.equal(context.res.statusCode, 200);
    const endCall = (context.res.end as ReturnType<typeof mock.fn>).mock.calls[0];
    assert.ok(endCall);
    const body = JSON.parse(endCall.arguments[0] as string);
    assert.deepEqual(body, {
      task: { id: 'task-123', name: 'Example task' },
    });
  });

  it('read handler supports explicit taskId argument', async () => {
    const handlers = createTaskHandlers({
      getTaskById: (id: string) => ({ id, name: 'Explicit task' }),
    });

    const context = createContext();

    await handlers.read(context, 'explicit-id');
    assert.equal(context.res.statusCode, 200);
    const endCall = (context.res.end as ReturnType<typeof mock.fn>).mock.calls[0];
    assert.ok(endCall);
    const body = JSON.parse(endCall.arguments[0] as string);
    assert.deepEqual(body, {
      task: { id: 'explicit-id', name: 'Explicit task' },
    });
  });

  it('read handler requires task identifier', async () => {
    const handlers = createTaskHandlers({
      getTaskById: () => ({ id: 'unused', name: 'Unused' }),
    });

    const context = createContext({ params: {} });

    await handlers.read(context, '');
    assert.equal(context.res.statusCode, 400);
    const endCall = (context.res.end as ReturnType<typeof mock.fn>).mock.calls[0];
    assert.ok(endCall);
    const body = JSON.parse(endCall.arguments[0] as string);
    assert.deepEqual(body, { error: 'Task identifier is required' });
  });

  it('read handler returns 404 when task is not found', async () => {
    const handlers = createTaskHandlers({
      getTaskById: () => undefined,
    });

    const context = createContext({ params: { id: 'missing' } });

    await handlers.read(context, '');
    assert.equal(context.res.statusCode, 404);
    const endCall = (context.res.end as ReturnType<typeof mock.fn>).mock.calls[0];
    assert.ok(endCall);
    const body = JSON.parse(endCall.arguments[0] as string);
    assert.deepEqual(body, { error: 'Task not found' });
  });
});

