import { apiDelete, apiGet, apiPatch, apiPost } from './api-client.js';
import type { PlanDetail, PlanSummary, PlanStatus } from '../../types/plan-mode.js';

interface PlanListResponse {
  data?: PlanSummary[];
}

interface PlanDetailResponse {
  data?: PlanDetail;
}

interface PlanBuildResponse {
  data?: { plan: PlanSummary; taskId: string };
}

export interface PlanCreatePayload {
  org: string;
  repo: string;
  title: string;
  markdown: string;
  issueNumber?: number;
  issueUrl?: string;
  description?: string;
}

export async function listPlans(org: string, repo: string): Promise<PlanSummary[]> {
  const params = new URLSearchParams({ org, repo });
  const response = await apiGet<PlanListResponse>(
    `/api/plan-mode/plans?${params.toString()}`,
    { errorPrefix: 'Failed to load plans' },
  );
  return response?.data ?? [];
}

export async function createPlan(payload: PlanCreatePayload): Promise<PlanDetail> {
  const response = await apiPost<PlanDetailResponse>(
    '/api/plan-mode/plans',
    payload,
    { errorPrefix: 'Failed to create plan' },
  );
  if (!response?.data) {
    throw new Error('Plan creation failed');
  }
  return response.data;
}

export async function fetchPlan(org: string, repo: string, id: string): Promise<PlanDetail> {
  const params = new URLSearchParams({ org, repo });
  const response = await apiGet<PlanDetailResponse>(
    `/api/plan-mode/plans/${encodeURIComponent(id)}?${params.toString()}`,
    { errorPrefix: 'Failed to load plan' },
  );
  if (!response?.data) {
    throw new Error('Plan not found');
  }
  return response.data;
}

export async function updatePlanMarkdown(
  org: string,
  repo: string,
  id: string,
  markdown: string,
): Promise<PlanDetail> {
  const response = await apiPatch<PlanDetailResponse>(
    `/api/plan-mode/plans/${encodeURIComponent(id)}`,
    { org, repo, id, markdown },
    { errorPrefix: 'Failed to update plan' },
  );
  if (!response?.data) {
    throw new Error('Plan update failed');
  }
  return response.data;
}

export async function updatePlanStatus(
  org: string,
  repo: string,
  id: string,
  status: PlanStatus,
): Promise<PlanDetail> {
  const response = await apiPatch<PlanDetailResponse>(
    `/api/plan-mode/plans/${encodeURIComponent(id)}`,
    { org, repo, id, status },
    { errorPrefix: 'Failed to update plan status' },
  );
  if (!response?.data) {
    throw new Error('Plan status update failed');
  }
  return response.data;
}

export async function ensurePlanSession(org: string, repo: string, id: string): Promise<PlanDetail> {
  const params = new URLSearchParams({ org, repo });
  const response = await apiPost<PlanDetailResponse>(
    `/api/plan-mode/plans/${encodeURIComponent(id)}/session?${params.toString()}`,
    {},
    { errorPrefix: 'Failed to start plan session' },
  );
  if (!response?.data) {
    throw new Error('Plan session response missing');
  }
  return response.data;
}

export async function buildPlan(
  org: string,
  repo: string,
  id: string,
): Promise<{ plan: PlanSummary; taskId: string } | null> {
  const params = new URLSearchParams({ org, repo });
  const response = await apiPost<PlanBuildResponse>(
    `/api/plan-mode/plans/${encodeURIComponent(id)}/build?${params.toString()}`,
    {},
    { errorPrefix: 'Failed to build plan' },
  );
  return response?.data ?? null;
}

export async function deletePlan(org: string, repo: string, id: string): Promise<void> {
  await apiDelete(`/api/plan-mode/plans/${encodeURIComponent(id)}`, { org, repo, id }, {
    errorPrefix: 'Failed to delete plan',
  });
}
