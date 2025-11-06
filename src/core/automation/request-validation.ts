/* c8 ignore file */
import { normaliseBranchName } from '../git.js';

/**
 * Helpers for validating inbound automation API requests and normalising payload data.
 */

export class AutomationRequestError extends Error {
  status: number;
  override cause?: unknown;
  
  constructor(status: number, message: string, cause?: unknown) {
    super(message);
    this.name = 'AutomationRequestError';
    this.status = status;
    if (cause) {
      this.cause = cause;
    }
  }
}

export function extractApiKey(req: { headers?: Record<string, string | string[] | undefined> }): string {
  const apiKeyHeader = req.headers?.['x-api-key'];
  if (typeof apiKeyHeader === 'string' && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  const authHeader = req.headers?.['authorization'];
  if (typeof authHeader === 'string') {
    const trimmed = authHeader.trim();
    if (/^bearer\s+/i.test(trimmed)) {
      return trimmed.replace(/^bearer\s+/i, '').trim();
    }
  }

  return '';
}

export async function parseRequestPayload(readJsonBody: () => Promise<unknown>): Promise<unknown> {
  try {
    return await readJsonBody();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Invalid JSON payload';
    throw new AutomationRequestError(400, message, error instanceof Error ? error : undefined);
  }
}

export function parsePlanFlag(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  throw new AutomationRequestError(400, 'plan must be a boolean');
}

export function validatePrompt(rawPrompt: unknown): string {
  if (rawPrompt === undefined) {
    return '';
  }

  if (typeof rawPrompt !== 'string') {
    throw new AutomationRequestError(400, 'prompt must be a string');
  }

  return rawPrompt;
}

export function parseRepoIdentifier(input: unknown): { org: string; repo: string } {
  if (typeof input !== 'string' || !input.trim()) {
    throw new AutomationRequestError(
      400,
      'repo must be provided in the format "org/repository"',
    );
  }

  const cleaned = input.trim().replace(/\.git$/i, '');
  const segments = cleaned.split('/').filter(Boolean);

  if (segments.length !== 2) {
    throw new AutomationRequestError(
      400,
      'repo must be provided in the format "org/repository"',
    );
  }

  return { org: segments[0]!, repo: segments[1]! };
}

export function sanitiseWorktreeDescriptor(worktreeDescriptor: unknown): string {
  if (typeof worktreeDescriptor !== 'string' || !worktreeDescriptor.trim()) {
    throw new AutomationRequestError(400, 'worktree must be provided as "type/title"');
  }

  const parts = worktreeDescriptor
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    throw new AutomationRequestError(
      400,
      'worktree must include both type and title separated by "/"',
    );
  }

  const slugify = (value: string): string =>
    value
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '');

  const segments: string[] = parts.map((part): string => {
    const slug = slugify(part);
    if (!slug) {
      throw new AutomationRequestError(
        400,
        'worktree name segments must include alphanumeric characters',
      );
    }
    return slug;
  });

  const branchName = normaliseBranchName(segments.join('/'));
  if (!branchName) {
    throw new AutomationRequestError(400, 'Derived branch name is empty');
  }
  if (branchName.toLowerCase() === 'main') {
    throw new AutomationRequestError(400, 'worktree branch "main" is not allowed');
  }

  return branchName;
}

export function resolveAgentCommand(agentCommands: unknown, requested: unknown): { key: string; command: unknown } {
  const key = typeof requested === 'string' ? requested.trim().toLowerCase() : '';
  if (!key) {
    throw new AutomationRequestError(400, 'command must be one of: codex, cursor, claude');
  }

  const commands = agentCommands as Record<string, unknown>;
  const mapping: Record<string, unknown> = {
    codex: commands?.['codexDangerous'] || commands?.['codex'],
    cursor: commands?.['cursor'],
    claude: commands?.['claudeDangerous'] || commands?.['claude'],
  };

  const command = mapping[key as keyof typeof mapping];
  if (!command) {
    throw new AutomationRequestError(
      400,
      `Unsupported command "${requested}". Expected codex, cursor, or claude.`,
    );
  }

  return { key, command: command as string };
}

export interface ValidateAutomationRequestParams {
  req: { headers?: Record<string, string | string[] | undefined> };
  expectedApiKey: string;
  readJsonBody: () => Promise<unknown>;
  agentCommands: unknown;
}

export async function validateAutomationRequest({
  req,
  expectedApiKey,
  readJsonBody,
  agentCommands,
}: ValidateAutomationRequestParams): Promise<{
  payload: unknown;
  planEnabled: boolean;
  routeLabel: string;
  org: string;
  repo: string;
  agent: { key: string; command: unknown };
  prompt: string;
  worktreeInput: string;
}> {
  if (!expectedApiKey) {
    throw new AutomationRequestError(
      503,
      'Automation API is not configured (missing API key)',
    );
  }

  const providedKey = extractApiKey(req);
  if (providedKey !== expectedApiKey) {
    throw new AutomationRequestError(401, 'Invalid API key');
  }

  const payload = await parseRequestPayload(readJsonBody) as Record<string, unknown>;
  const planEnabled = parsePlanFlag(payload['plan']);
  const routeLabel = planEnabled ? 'create-plan' : 'passthrough';

  const prompt = validatePrompt(payload['prompt']);
  const { org, repo } = parseRepoIdentifier(payload['repo']);

  const worktreeInput =
    typeof payload['worktree'] === 'string' ? payload['worktree'].trim() : '';

  const agent = resolveAgentCommand(agentCommands, payload['command']);

  return {
    payload,
    planEnabled,
    routeLabel,
    prompt,
    org,
    repo,
    worktreeInput,
    agent,
  };
}
