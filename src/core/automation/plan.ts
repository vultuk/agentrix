import { AutomationRequestError } from './request-validation.js';

/**
 * Utilities for wrapping optional plan generation prior to launching an automation task.
 */

export interface GeneratePlanTextParams {
  planEnabled: boolean;
  prompt: string;
  planService: unknown;
  repositoryPath?: string;
}

export interface GeneratePlanTextResult {
  promptToExecute: string;
  planGenerated: boolean;
}

export async function generatePlanText({
  planEnabled,
  prompt,
  planService,
  repositoryPath,
}: GeneratePlanTextParams): Promise<GeneratePlanTextResult> {
  if (!planEnabled) {
    return { promptToExecute: prompt, planGenerated: false };
  }

  if (!prompt.trim()) {
    throw new AutomationRequestError(400, 'prompt is required when plan is true');
  }

  const service = planService as { isConfigured?: boolean; createPlanText?: (opts: unknown) => Promise<string> };
  if (!service || !service.isConfigured) {
    throw new AutomationRequestError(
      503,
      'Plan generation is not configured. Configure a local LLM command (set planLlm in config.json).'
    );
  }

  try {
    const planText = await service.createPlanText!({
      prompt,
      cwd: repositoryPath,
    });

    return { promptToExecute: planText, planGenerated: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AutomationRequestError(
      500,
      message,
      error instanceof Error ? error : undefined
    );
  }
}
