import { describe, test, expect } from 'bun:test';
import { validateAutomationRequest } from '../request-validation.js';

describe('request-validation', () => {
  const agentCommands = {
    codex: 'codex-command',
    cursor: 'cursor-command',
    claude: 'claude-command',
  };

  const buildRequest = (headers = {}) => ({
    headers,
  });

  test('returns parsed payload when request is valid', async () => {
    const req = buildRequest({ 'x-api-key': 'secret' });
    const payload = {
      plan: true,
      prompt: 'Fix login issue',
      repo: 'acme/webapp',
      worktree: 'feature/Login Improvements',
      command: 'codex',
    };

    const result = await validateAutomationRequest({
      req,
      expectedApiKey: 'secret',
      readJsonBody: async () => payload,
      agentCommands,
    });

    expect(result.planEnabled).toBe(true);
    expect(result.routeLabel).toBe('create-plan');
    expect(result.prompt).toBe(payload.prompt);
    expect(result.org).toBe('acme');
    expect(result.repo).toBe('webapp');
    expect(result.worktreeInput).toBe('feature/Login Improvements');
    expect(result.agent).toEqual({ key: 'codex', command: 'codex-command' });
  });

  test('falls back to bearer token header for API key', async () => {
    const req = buildRequest({ authorization: 'Bearer SECRET' });
    const payload = {
      plan: false,
      prompt: '',
      repo: 'acme/app',
      command: 'cursor',
    };

    const result = await validateAutomationRequest({
      req,
      expectedApiKey: 'SECRET',
      readJsonBody: async () => payload,
      agentCommands,
    });

    expect(result.planEnabled).toBe(false);
    expect(result.routeLabel).toBe('passthrough');
    expect(result.agent).toEqual({ key: 'cursor', command: 'cursor-command' });
  });

  test('throws 503 when automation API key is missing', async () => {
    const req = buildRequest();

    await expect(
      validateAutomationRequest({
        req,
        expectedApiKey: '',
        readJsonBody: async () => ({}),
        agentCommands,
      }),
    ).rejects.toMatchObject({
      status: 503,
      message: 'Automation API is not configured (missing API key)',
    });
  });

  test('throws 401 when provided API key is invalid', async () => {
    const req = buildRequest({ 'x-api-key': 'wrong' });

    await expect(
      validateAutomationRequest({
        req,
        expectedApiKey: 'secret',
        readJsonBody: async () => ({}),
        agentCommands,
      }),
    ).rejects.toMatchObject({ status: 401, message: 'Invalid API key' });
  });

  test('throws 400 when payload JSON cannot be parsed', async () => {
    const req = buildRequest({ 'x-api-key': 'secret' });
    const parseError = new Error('Unexpected token');

    await expect(
      validateAutomationRequest({
        req,
        expectedApiKey: 'secret',
        readJsonBody: async () => {
          throw parseError;
        },
        agentCommands,
      }),
    ).rejects.toMatchObject({ status: 400, message: 'Unexpected token', cause: parseError });
  });

  test('throws 400 when plan flag is not a boolean', async () => {
    const req = buildRequest({ 'x-api-key': 'secret' });

    await expect(
      validateAutomationRequest({
        req,
        expectedApiKey: 'secret',
        readJsonBody: async () => ({
          plan: 'yes',
          prompt: '',
          repo: 'acme/service',
          command: 'claude',
        }),
        agentCommands,
      }),
    ).rejects.toMatchObject({ status: 400, message: 'plan must be a boolean' });
  });

  test('throws 400 when repo identifier is invalid', async () => {
    const req = buildRequest({ 'x-api-key': 'secret' });

    await expect(
      validateAutomationRequest({
        req,
        expectedApiKey: 'secret',
        readJsonBody: async () => ({
          plan: false,
          prompt: '',
          repo: 'acme',
          command: 'codex',
        }),
        agentCommands,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'repo must be provided in the format "org/repository"',
    });
  });

  test('throws 400 when command is missing or unsupported', async () => {
    const req = buildRequest({ 'x-api-key': 'secret' });

    await expect(
      validateAutomationRequest({
        req,
        expectedApiKey: 'secret',
        readJsonBody: async () => ({
          plan: false,
          prompt: '',
          repo: 'acme/app',
          command: 'unknown',
        }),
        agentCommands,
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'Unsupported command "unknown". Expected codex, cursor, or claude.',
    });
  });
});
