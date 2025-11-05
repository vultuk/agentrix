/**
 * Plans API service
 */

import { apiGet, apiPost, apiDelete } from './api-client.js';
import type { Plan } from '../../types/domain.js';

interface FetchPlansResponse {
  plans: Plan[];
}

interface FetchPlanResponse {
  content: string;
}

interface CreatePlanFromPromptResponse {
  plan: string;
}

/**
 * Fetch all plans for a repository
 */
export async function fetchPlans(org: string, repo: string): Promise<Plan[]> {
  const params = new URLSearchParams({ org, repo });
  const response = await apiGet<FetchPlansResponse>(
    `/api/plans?${params.toString()}`,
    { errorPrefix: 'Failed to fetch plans' }
  );
  return response.plans || [];
}

/**
 * Fetch a specific plan
 */
export async function fetchPlan(org: string, repo: string, planId: string): Promise<string> {
  const params = new URLSearchParams({ org, repo, planId });
  const response = await apiGet<FetchPlanResponse>(
    `/api/plans/content?${params.toString()}`,
    { errorPrefix: 'Failed to load plan' }
  );
  return response.content || '';
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

