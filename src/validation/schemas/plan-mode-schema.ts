import { validateRequired } from '../request-validator.js';
import type { PlanSource, PlanStatus } from '../../core/plan-mode-store.js';

export interface PlanIdentifyInput {
  org: string;
  repo: string;
  id: string;
}

export interface PlanListInput {
  org: string;
  repo: string;
}

export interface PlanCreateInput extends PlanListInput {
  title: string;
  markdown: string;
  source: PlanSource;
  seedDescription?: string;
}

export interface PlanUpdateInput extends PlanIdentifyInput {
  markdown?: string;
  status?: PlanStatus;
}

export type PlanDeleteInput = PlanIdentifyInput;

function ensureRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid request payload');
  }
  return value as Record<string, unknown>;
}

function parseSource(payload: Record<string, unknown>): PlanSource {
  const issueNumberRaw = payload['issueNumber'];
  const issueUrl = typeof payload['issueUrl'] === 'string' ? payload['issueUrl'].trim() : '';
  let issueNumber: number | undefined;
  if (typeof issueNumberRaw === 'number' && Number.isFinite(issueNumberRaw)) {
    issueNumber = Math.floor(issueNumberRaw);
  } else if (typeof issueNumberRaw === 'string' && issueNumberRaw.trim()) {
    const parsed = Number.parseInt(issueNumberRaw.trim(), 10);
    if (Number.isFinite(parsed)) {
      issueNumber = parsed;
    }
  }
  if (issueNumber || issueUrl) {
    return {
      type: 'issue',
      issueNumber: issueNumber ?? undefined,
      issueUrl: issueUrl || undefined,
    };
  }
  return { type: 'manual' };
}

export function validatePlanListInput(payload: unknown): PlanListInput {
  const record = ensureRecord(payload);
  const { org, repo } = validateRequired(record, ['org', 'repo'] as const);
  return { org, repo };
}

export function validatePlanIdentifyInput(
  params: unknown,
  query: unknown,
): PlanIdentifyInput {
  const recordParams = ensureRecord(params);
  const recordQuery = ensureRecord(query);
  const { id } = validateRequired(recordParams, ['id'] as const);
  const { org, repo } = validatePlanListInput(recordQuery);
  return { org, repo, id };
}

export function validatePlanCreateInput(payload: unknown): PlanCreateInput {
  const record = ensureRecord(payload);
  const { org, repo, title } = validateRequired(record, ['org', 'repo', 'title'] as const);
  const markdown = typeof record['markdown'] === 'string' ? record['markdown'] : '';
  if (!markdown.trim()) {
    throw new Error('markdown is required');
  }
  const seedDescription =
    typeof record['description'] === 'string' && record['description'].trim().length > 0
      ? record['description']
      : undefined;
  return {
    org,
    repo,
    title,
    markdown,
    source: parseSource(record),
    seedDescription,
  };
}

export function validatePlanUpdateInput(payload: unknown): PlanUpdateInput {
  const record = ensureRecord(payload);
  const { org, repo, id } = validateRequired(record, ['org', 'repo', 'id'] as const);
  const update: PlanUpdateInput = { org, repo, id };
  if ('markdown' in record) {
    update.markdown = typeof record['markdown'] === 'string' ? record['markdown'] : '';
  }
  if ('status' in record) {
    const status = record['status'];
    const allowed: PlanStatus[] = ['draft', 'updated', 'ready', 'building'];
    if (typeof status !== 'string' || !allowed.includes(status as PlanStatus)) {
      throw new Error('status must be a valid plan status');
    }
    update.status = status as PlanStatus;
  }
  if (!('markdown' in record) && !('status' in record)) {
    throw new Error('At least one of markdown or status must be provided');
  }
  return update;
}

export function validatePlanDeleteInput(payload: unknown): PlanDeleteInput {
  const record = ensureRecord(payload);
  const { org, repo, id } = validateRequired(record, ['org', 'repo', 'id'] as const);
  return { org, repo, id };
}
