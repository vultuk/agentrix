/**
 * Plans API service
 */

import { apiGet, apiPost, apiDelete } from './api-client.js';
import type { PlanHistoryEntry } from '../../types/plan.js';

export interface PlanDetails extends PlanHistoryEntry {
  content: string;
}

interface FetchPlansResponse {
  data?: PlanHistoryEntry[];
}

interface FetchPlanResponse {
  data?: PlanDetails;
}

interface CreatePlanFromPromptResponse {
  plan: string;
}

/**
 * Fetch all plans for a worktree
 */
export async function fetchPlans(
  org: string,
  repo: string,
  branch: string,
  limit?: number
): Promise<PlanHistoryEntry[]> {
  const params = new URLSearchParams({ org, repo, branch });
  if (typeof limit === 'number' && Number.isFinite(limit) && limit > 0) {
    params.set('limit', String(Math.floor(limit)));
  }
  const response = await apiGet<FetchPlansResponse>(
    `/api/plans?${params.toString()}`,
    { errorPrefix: 'Failed to fetch plans' }
  );
  return Array.isArray(response?.data) ? response.data : [];
}

/**
 * Fetch a specific plan
 */
export async function fetchPlan(
  org: string,
  repo: string,
  branch: string,
  planId: string
): Promise<string> {
  const params = new URLSearchParams({ org, repo, branch, planId });
  const response = await apiGet<FetchPlanResponse>(
    `/api/plans/content?${params.toString()}`,
    { errorPrefix: 'Failed to load plan' }
  );
  const content = response?.data?.content;
  return typeof content === 'string' ? content : '';
}

/**
 * Create a new plan
 */
export async function createPlan(org: string, repo: string, name: string, content: string): Promise<unknown> {
  return await apiPost(
    '/api/plans',
    { org, repo, name, content },
    { errorPrefix: 'Failed to create plan' }
  );
}

/**
 * Create a plan from a prompt (generates the plan content)
 */
export async function createPlanFromPrompt(
  prompt: string,
  org: string,
  repo: string,
  rawPrompt = false,
  dangerousMode = false
): Promise<string> {
  const response = await apiPost<CreatePlanFromPromptResponse>(
    '/api/create-plan',
    {
      prompt,
      org,
      repo,
      rawPrompt,
      dangerousMode,
    },
    { errorPrefix: 'Failed to create plan from prompt' }
  );

  const planText = response && typeof response.plan === 'string' ? response.plan : '';
  if (!planText.trim()) {
    throw new Error('Server returned an empty plan. Check server logs for details.');
  }

  return planText;
}

/**
 * Delete a plan
 */
export async function deletePlan(org: string, repo: string, planId: string): Promise<boolean> {
  const params = new URLSearchParams({ org, repo, planId });
  await apiDelete(
    `/api/plans?${params.toString()}`,
    undefined,
    { errorPrefix: 'Failed to delete plan' }
  );
  return true;
}
