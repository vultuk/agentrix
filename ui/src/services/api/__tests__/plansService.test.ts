import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { fetchPlans, fetchPlan } from '../plansService.js';

function createResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('plansService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests plans for the specified branch', async () => {
    const plansPayload = [
      { id: '20240101_010101-main.md', branch: 'main', createdAt: '2024-01-01T01:01:01.000Z' },
    ];
    const fetchSpy = vi.fn().mockResolvedValue(createResponse({ data: plansPayload }));
    vi.stubGlobal('fetch', fetchSpy);

    const plans = await fetchPlans('acme', 'widgets', 'feature/plan');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toContain('org=acme');
    expect(url).toContain('repo=widgets');
    expect(url).toContain('branch=feature%2Fplan');
    expect(options).toMatchObject({ method: 'GET', credentials: 'include' });
    expect(plans).toEqual(plansPayload);
  });

  it('includes a floored limit parameter when provided', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(createResponse({ data: [] }));
    vi.stubGlobal('fetch', fetchSpy);

    await fetchPlans('acme', 'widgets', 'main', 7.8);

    const [url] = fetchSpy.mock.calls[0];
    const { searchParams } = new URL(url, 'http://localhost');
    expect(searchParams.get('limit')).toBe('7');
  });

  it('requests a specific plan with branch context and returns its content', async () => {
    const payload = {
      data: {
        id: '20240101_010101-feature_plan.md',
        branch: 'feature_plan',
        createdAt: '2024-01-01T01:01:01.000Z',
        content: '# test plan',
      },
    };
    const fetchSpy = vi.fn().mockResolvedValue(createResponse(payload));
    vi.stubGlobal('fetch', fetchSpy);

    const content = await fetchPlan('acme', 'widgets', 'feature/plan', payload.data.id);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('org=acme');
    expect(url).toContain('repo=widgets');
    expect(url).toContain('branch=feature%2Fplan');
    expect(url).toContain(`planId=${encodeURIComponent(payload.data.id)}`);
    expect(content).toBe('# test plan');
  });
});
