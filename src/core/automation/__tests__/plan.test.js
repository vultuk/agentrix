import { describe, test, expect } from 'bun:test';
import { generatePlanText } from '../plan.js';
import { AutomationRequestError } from '../request-validation.js';

describe('plan.generatePlanText', () => {
  test('returns original prompt when plan is disabled', async () => {
    const result = await generatePlanText({
      planEnabled: false,
      prompt: 'Refactor module',
      planService: null,
      repositoryPath: '/tmp/repo',
    });

    expect(result).toEqual({
      promptToExecute: 'Refactor module',
      planGenerated: false,
    });
  });

  test('throws when prompt is missing while plan is enabled', async () => {
    await expect(
      generatePlanText({
        planEnabled: true,
        prompt: '   ',
        planService: { isConfigured: true },
        repositoryPath: '/tmp/repo',
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'prompt is required when plan is true',
    });
  });

  test('throws when plan service is not configured', async () => {
    await expect(
      generatePlanText({
        planEnabled: true,
        prompt: 'Investigate bug',
        planService: null,
        repositoryPath: '/tmp/repo',
      }),
    ).rejects.toMatchObject({
      status: 503,
      message:
        'Plan generation is not configured. Configure a local LLM command (set planLlm in config.json).',
    });
  });

  test('returns generated plan text when service succeeds', async () => {
    const planService = {
      isConfigured: true,
      async createPlanText({ prompt, cwd }) {
        expect(prompt).toBe('Add feature');
        expect(cwd).toBe('/workspace/repo');
        return 'Plan: 1. Do thing';
      },
    };

    const result = await generatePlanText({
      planEnabled: true,
      prompt: 'Add feature',
      planService,
      repositoryPath: '/workspace/repo',
    });

    expect(result).toEqual({
      promptToExecute: 'Plan: 1. Do thing',
      planGenerated: true,
    });
  });

  test('wraps plan service failures', async () => {
    const planService = {
      isConfigured: true,
      async createPlanText() {
        throw new Error('Service unavailable');
      },
    };

    await expect(
      generatePlanText({
        planEnabled: true,
        prompt: 'Handle errors',
        planService,
        repositoryPath: '/workspace/repo',
      }),
    ).rejects.toBeInstanceOf(AutomationRequestError);
  });
});
