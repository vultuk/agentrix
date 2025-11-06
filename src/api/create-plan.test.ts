import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import type { RequestContext } from '../types/http.js';
import type { PlanService } from '../types/plan.js';
import { __setCreatePlanTestOverrides, createPlanHandlers } from './create-plan.js';

function setupOverrides(deps?: {
  ensureRepository?: (workdir: string, org: string, repo: string) => Promise<{ repositoryPath: string }>;
  sendJson?: (res: unknown, status: number, payload: unknown) => void;
}) {
  const ensureRepo = mock.fn(async () => ({ repositoryPath: '/repo/path' }));
  const sendJson = mock.fn();

  __setCreatePlanTestOverrides({
    ensureRepository: deps?.ensureRepository ?? ensureRepo,
    sendJson: deps?.sendJson ?? sendJson,
  });

  return { ensureRepository: ensureRepo, sendJson };
}

function createContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    req: { headers: {} } as unknown as RequestContext['req'],
    res: {
      statusCode: 0,
      setHeader: mock.fn(),
      getHeader: mock.fn(),
      end: mock.fn(),
    } as unknown as RequestContext['res'],
    url: new URL('http://localhost/api/plans'),
    method: 'POST',
    workdir: '/tmp/workdir',
    readJsonBody: async () => ({}),
    ...overrides,
  };
}

describe('createPlanHandlers', () => {
  it('validates prompt presence', async () => {
    const { sendJson } = setupOverrides();

    const handlers = createPlanHandlers({ planService: { isConfigured: true } as PlanService });
    const context = createContext({
      readJsonBody: async () => ({ prompt: '' }),
    });

    await handlers.create(context);
    __setCreatePlanTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 400);
    assert.deepEqual(call.arguments[2], { error: 'prompt is required' });
  });

  it('requires plan service configuration', async () => {
    const { sendJson } = setupOverrides();

    const handlers = createPlanHandlers({});
    const context = createContext({
      readJsonBody: async () => ({ prompt: 'test' }),
    });

    await handlers.create(context);
    __setCreatePlanTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 500);
    assert.match(String(call.arguments[2]?.['error']), /Plan generation is not configured/);
  });

  it('validates org/repo pairing', async () => {
    const { sendJson } = setupOverrides();

    const planService = {
      isConfigured: true,
      createPlanText: mock.fn(async () => 'plan'),
    } as unknown as PlanService;

    const handlers = createPlanHandlers({ planService });
    const context = createContext({
      readJsonBody: async () => ({ prompt: 'test', org: 'org' }),
    });

    await handlers.create(context);
    __setCreatePlanTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 400);
    assert.deepEqual(call.arguments[2], {
      error: 'Both org and repo must be provided when specifying repository context.',
    });
  });

  it('requires workdir when org/repo provided', async () => {
    const { sendJson } = setupOverrides();

    const planService = {
      isConfigured: true,
      createPlanText: mock.fn(async () => 'plan'),
    } as unknown as PlanService;

    const handlers = createPlanHandlers({ planService });
    const context = createContext({
      workdir: '',
      readJsonBody: async () => ({ prompt: 'test', org: 'org', repo: 'repo' }),
    });

    await handlers.create(context);
    __setCreatePlanTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 500);
    assert.deepEqual(call.arguments[2], { error: 'Server workdir is not configured.' });
  });

  it('handles repository not found errors', async () => {
    const ensureRepo = mock.fn(async () => {
      throw new Error('Repository not found');
    });
    const { sendJson } = setupOverrides({ ensureRepository: ensureRepo });

    const planService = {
      isConfigured: true,
      createPlanText: mock.fn(async () => 'plan'),
    } as unknown as PlanService;

    const handlers = createPlanHandlers({ planService });
    const context = createContext({
      readJsonBody: async () => ({ prompt: 'test', org: 'org', repo: 'repo' }),
    });

    await handlers.create(context);
    __setCreatePlanTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 404);
    assert.deepEqual(call.arguments[2], { error: 'Repository not found' });
  });

  it('invokes plan service with prompt and options', async () => {
    const { sendJson, ensureRepository } = setupOverrides();

    const createPlanText = mock.fn(async () => 'generated plan');
    const planService = {
      isConfigured: true,
      createPlanText,
    } as unknown as PlanService;

    const handlers = createPlanHandlers({ planService });
    const context = createContext({
      readJsonBody: async () => ({
        prompt: 'test prompt',
        org: 'org',
        repo: 'repo',
        rawPrompt: true,
        dangerousMode: true,
      }),
    });

    await handlers.create(context);
    __setCreatePlanTestOverrides();

    assert.equal(ensureRepository.mock.calls.length, 1);
    assert.equal(createPlanText.mock.calls.length, 1);
    const planCall = createPlanText.mock.calls[0];
    assert.ok(planCall);
    assert.deepEqual(planCall.arguments[0], {
      prompt: 'test prompt',
      cwd: '/repo/path',
      rawPrompt: true,
      dangerousMode: true,
    });

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 200);
    assert.deepEqual(call.arguments[2], { plan: 'generated plan' });
  });

  it('handles plan service errors gracefully', async () => {
    const { sendJson } = setupOverrides();

    const planService = {
      isConfigured: true,
      createPlanText: mock.fn(async () => {
        throw new Error('LLM command failed');
      }),
    } as unknown as PlanService;

    const handlers = createPlanHandlers({ planService });
    const context = createContext({
      readJsonBody: async () => ({ prompt: 'test' }),
    });

    await handlers.create(context);
    __setCreatePlanTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 502);
    assert.deepEqual(call.arguments[2], { error: 'LLM command failed' });
  });

  it('handles JSON parse errors', async () => {
    const { sendJson } = setupOverrides();

    const planService = {
      isConfigured: true,
      createPlanText: mock.fn(async () => 'plan'),
    } as unknown as PlanService;

    const handlers = createPlanHandlers({ planService });
    const context = createContext({
      readJsonBody: async () => {
        throw new Error('Invalid JSON');
      },
    });

    await handlers.create(context);
    __setCreatePlanTestOverrides();

    assert.equal(sendJson.mock.calls.length, 1);
    const call = sendJson.mock.calls[0];
    assert.ok(call);
    assert.equal(call.arguments[1], 400);
    assert.deepEqual(call.arguments[2], { error: 'Invalid JSON' });
  });
});

