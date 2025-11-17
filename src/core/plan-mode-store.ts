import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export type PlanStatus = 'draft' | 'updated' | 'ready' | 'building';

export interface PlanSource {
  type: 'manual' | 'issue';
  issueNumber?: number;
  issueUrl?: string;
}

export interface PlanDiffLine {
  type: 'context' | 'added' | 'removed';
  beforeLine?: number | null;
  afterLine?: number | null;
  text: string;
}

export interface PlanDiffHunk {
  beforeStartLine: number;
  afterStartLine: number;
  lines: PlanDiffLine[];
}

export interface PlanDiffSnapshot {
  updatedAt: string;
  updatedBy: 'user' | 'codex';
  hunks: PlanDiffHunk[];
}

export interface PlanRecord {
  id: string;
  org: string;
  repo: string;
  title: string;
  markdown: string;
  status: PlanStatus;
  source: PlanSource;
  createdAt: string;
  updatedAt: string;
  codexSessionId: string | null;
  defaultBranch: string | null;
  worktreeBranch: string | null;
  lastChange: PlanDiffSnapshot | null;
  slug: string;
}

interface PlansFile {
  version: 1;
  plans: PlanRecord[];
}

interface PlanStoreOptions {
  workdir: string;
  org: string;
  repo: string;
}

interface CreatePlanInput {
  title: string;
  markdown: string;
  source: PlanSource;
  defaultBranch: string | null;
  codexSessionId?: string | null;
}

interface UpdatePlanInput {
  markdown?: string;
  status?: PlanStatus;
  codexSessionId?: string | null;
  worktreeBranch?: string | null;
  defaultBranch?: string | null;
  updatedBy?: 'user' | 'codex';
}

const PLAN_STATE_ENV = 'AGENTRIX_PLAN_STORE';
const LEGACY_PLAN_DIRECTORY = '.agentrix/plan-mode';
const ALT_LEGACY_PLAN_DIRECTORY = '.agentrix-state';
const PLAN_MODE_SUBDIR = 'plan-mode';
const CONTEXT_LINES = 2;

const writeQueues = new Map<string, Promise<void>>();

function requireValue(value: string, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

interface PlanPaths {
  primaryDir: string;
  primaryFile: string;
  legacyFiles: string[];
}

function resolveStateRoot(): string {
  const configured = typeof process.env[PLAN_STATE_ENV] === 'string' ? process.env[PLAN_STATE_ENV]!.trim() : '';
  if (configured) {
    return resolve(configured);
  }
  const homeDir = requireValue(process.env['HOME'] || process.env['USERPROFILE'] || '', 'home directory');
  return join(homeDir, '.agentrix', 'state');
}

function resolvePlanPaths({ workdir, org, repo }: PlanStoreOptions): PlanPaths {
  const safeWorkdir = requireValue(workdir, 'workdir');
  const safeOrg = requireValue(org, 'org');
  const safeRepo = requireValue(repo, 'repo');
  const storageRoot = resolveStateRoot();
  const primaryDir = join(storageRoot, PLAN_MODE_SUBDIR, safeOrg, safeRepo);
  const legacyDir = join(resolve(safeWorkdir), LEGACY_PLAN_DIRECTORY, safeOrg, safeRepo);
  const altLegacyDir = join(resolve(safeWorkdir, '..'), ALT_LEGACY_PLAN_DIRECTORY, PLAN_MODE_SUBDIR, safeOrg, safeRepo);
  return {
    primaryDir,
    primaryFile: join(primaryDir, 'plans.json'),
    legacyFiles: [join(legacyDir, 'plans.json'), join(altLegacyDir, 'plans.json')],
  };
}

async function ensureDirectoryForFile(filePath: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
}

async function writeAtomicFile(filePath: string, payload: string): Promise<void> {
  await ensureDirectoryForFile(filePath);
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmpPath, payload, 'utf8');
    await rename(tmpPath, filePath);
  } catch (error) {
    try {
      await rm(tmpPath, { force: true });
    } catch {
      // ignore
    }
    throw error;
  }
}

async function loadPlansFile(paths: PlanPaths): Promise<PlansFile> {
  try {
    const raw = await readFile(paths.primaryFile, 'utf8');
    const parsed = JSON.parse(raw) as PlansFile;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.plans)) {
      return parsed;
    }
    return { version: 1, plans: [] };
  } catch (error: any) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return await loadLegacyPlansFile(paths);
    }
    throw error;
  }
}

async function loadLegacyPlansFile(paths: PlanPaths): Promise<PlansFile> {
  for (const legacyFile of paths.legacyFiles) {
    try {
      const raw = await readFile(legacyFile, 'utf8');
      const parsed = JSON.parse(raw) as PlansFile;
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.plans)) {
        continue;
      }
      await persistPlansFile(paths, parsed);
      return parsed;
    } catch (error: any) {
      if (!error || typeof error !== 'object' || error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  return { version: 1, plans: [] };
}

async function persistPlansFile(paths: PlanPaths, payload: PlansFile): Promise<void> {
  const serialised = `${JSON.stringify(payload, null, 2)}\n`;
  const previous = writeQueues.get(paths.primaryFile) ?? Promise.resolve();
  const next = previous.then(() => writeAtomicFile(paths.primaryFile, serialised));
  writeQueues.set(
    paths.primaryFile,
    next
      .catch(() => {})
      .then(() => {}),
  );
  await next;
}

function slugify(value: string): string {
  const normalised = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (normalised) {
    return normalised;
  }
  return 'plan';
}

function normaliseMarkdown(input: string): string {
  const value = typeof input === 'string' ? input : '';
  if (!value.trim()) {
    return '';
  }
  return value.replace(/\r\n/g, '\n');
}

function clonePlan(plan: PlanRecord): PlanRecord {
  return JSON.parse(JSON.stringify(plan)) as PlanRecord;
}

interface DiffOperation {
  type: 'context' | 'added' | 'removed';
  value: string;
}

/**
 * Computes the ordered list of diff operations between two string arrays by
 * running a classic Longest Common Subsequence dynamic programming pass.
 * The resulting operations feed the diff hunk builder above so we can
 * persist human-friendly plan change previews alongside each plan.
 */
function buildDiffOperations(previous: string[], next: string[]): DiffOperation[] {
  const rows = previous.length;
  const cols = next.length;
  const matrix: number[][] = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(0));

  for (let i = 1; i <= rows; i++) {
    const currentRow = matrix[i];
    const prevRow = matrix[i - 1];
    if (!currentRow || !prevRow) {
      continue;
    }
    for (let j = 1; j <= cols; j++) {
      if (previous[i - 1] === next[j - 1]) {
        currentRow[j] = (prevRow[j - 1] ?? 0) + 1;
      } else {
        const top = prevRow[j] ?? 0;
        const left = currentRow[j - 1] ?? 0;
        currentRow[j] = Math.max(top, left);
      }
    }
  }

  const ops: DiffOperation[] = [];
  let i = rows;
  let j = cols;
  while (i > 0 && j > 0) {
    const prevRow = matrix[i - 1];
    const currentRow = matrix[i];
    if (!prevRow || !currentRow) {
      break;
    }
    const previousLine = previous[i - 1] ?? '';
    const nextLine = next[j - 1] ?? '';
    if (previousLine === nextLine) {
      ops.unshift({ type: 'context', value: previousLine });
      i--;
      j--;
    } else if ((prevRow[j] ?? 0) >= (currentRow[j - 1] ?? 0)) {
      ops.unshift({ type: 'removed', value: previousLine });
      i--;
    } else {
      ops.unshift({ type: 'added', value: nextLine });
      j--;
    }
  }
  while (i > 0) {
    ops.unshift({ type: 'removed', value: previous[i - 1] ?? '' });
    i--;
  }
  while (j > 0) {
    ops.unshift({ type: 'added', value: next[j - 1] ?? '' });
    j--;
  }
  return ops;
}

function createDiffSnapshot(oldValue: string, newValue: string, updatedBy: 'user' | 'codex'): PlanDiffSnapshot | null {
  if (oldValue === newValue) {
    return null;
  }
  const previous = oldValue.split('\n');
  const next = newValue.split('\n');
  const operations = buildDiffOperations(previous, next);
  const hunks: PlanDiffHunk[] = [];

  let beforeLine = 0;
  let afterLine = 0;
  let currentHunk: PlanDiffHunk | null = null;
  let trailingContext = 0;
  const contextBuffer: PlanDiffLine[] = [];

  const flushHunk = () => {
    if (currentHunk) {
      hunks.push(currentHunk);
      currentHunk = null;
    }
    trailingContext = 0;
  };

  const appendContextBufferToCurrent = () => {
    if (!currentHunk || contextBuffer.length === 0) {
      return;
    }
    contextBuffer.forEach((line) => currentHunk.lines.push(line));
    contextBuffer.length = 0;
  };

  for (const op of operations) {
    if (op.type === 'context') {
      beforeLine++;
      afterLine++;
      const line: PlanDiffLine = {
        type: 'context',
        beforeLine,
        afterLine,
        text: op.value,
      };
      if (currentHunk) {
        currentHunk.lines.push(line);
        trailingContext++;
        if (trailingContext >= CONTEXT_LINES) {
          flushHunk();
        }
      } else {
        contextBuffer.push(line);
        if (contextBuffer.length > CONTEXT_LINES) {
          contextBuffer.shift();
        }
      }
      continue;
    }

    if (!currentHunk) {
      const beforeStart = contextBuffer[0]?.beforeLine ?? beforeLine + 1;
      const afterStart = contextBuffer[0]?.afterLine ?? afterLine + 1;
      currentHunk = {
        beforeStartLine: beforeStart,
        afterStartLine: afterStart,
        lines: [],
      };
      appendContextBufferToCurrent();
    }
    trailingContext = 0;

    if (op.type === 'removed') {
      beforeLine++;
      currentHunk.lines.push({
        type: 'removed',
        beforeLine,
        afterLine: null,
        text: op.value,
      });
    } else {
      afterLine++;
      currentHunk.lines.push({
        type: 'added',
        beforeLine: null,
        afterLine,
        text: op.value,
      });
    }
  }

  flushHunk();

  if (!hunks.length) {
    return null;
  }

  return {
    updatedAt: new Date().toISOString(),
    updatedBy,
    hunks,
  };
}

export async function listPlans(options: PlanStoreOptions): Promise<PlanRecord[]> {
  const paths = resolvePlanPaths(options);
  const { plans } = await loadPlansFile(paths);
  return plans;
}

export async function createPlan(options: PlanStoreOptions, input: CreatePlanInput): Promise<PlanRecord> {
  const paths = resolvePlanPaths(options);
  const current = await loadPlansFile(paths);
  const now = new Date().toISOString();
  const record: PlanRecord = {
    id: randomUUID(),
    org: requireValue(options.org, 'org'),
    repo: requireValue(options.repo, 'repo'),
    title: input.title?.trim() || 'Untitled Plan',
    markdown: normaliseMarkdown(input.markdown),
    status: 'draft',
    source: input.source || { type: 'manual' },
    createdAt: now,
    updatedAt: now,
    codexSessionId: input.codexSessionId || null,
    defaultBranch: input.defaultBranch || null,
    worktreeBranch: null,
    lastChange: null,
    slug: slugify(input.title || 'Plan'),
  };
  current.plans.push(record);
  await persistPlansFile(paths, current);
  return record;
}

export async function readPlan(options: PlanStoreOptions & { id: string }): Promise<PlanRecord | null> {
  const paths = resolvePlanPaths(options);
  const current = await loadPlansFile(paths);
  const plan = current.plans.find((entry) => entry.id === options.id);
  return plan ? clonePlan(plan) : null;
}

export async function updatePlan(
  options: PlanStoreOptions & { id: string }, 
  input: UpdatePlanInput,
): Promise<PlanRecord> {
  const paths = resolvePlanPaths(options);
  const current = await loadPlansFile(paths);
  const planIndex = current.plans.findIndex((entry) => entry.id === options.id);
  if (planIndex === -1) {
    throw new Error('Plan not found');
  }
  const existing = current.plans[planIndex]!;
  const updated = clonePlan(existing);
  const now = new Date().toISOString();

  if (typeof input.codexSessionId === 'string' || input.codexSessionId === null) {
    updated.codexSessionId = input.codexSessionId || null;
  }
  if (typeof input.worktreeBranch === 'string' || input.worktreeBranch === null) {
    updated.worktreeBranch = input.worktreeBranch || null;
  }
  if (typeof input.defaultBranch === 'string' || input.defaultBranch === null) {
    updated.defaultBranch = input.defaultBranch || null;
  }
  if (input.status) {
    updated.status = input.status;
  }

  if (typeof input.markdown === 'string') {
    const nextMarkdown = normaliseMarkdown(input.markdown);
    const diff = createDiffSnapshot(updated.markdown, nextMarkdown, input.updatedBy || 'user');
    updated.markdown = nextMarkdown;
    updated.updatedAt = now;
    updated.lastChange = diff;
    if (diff && input.updatedBy === 'codex') {
      updated.status = 'updated';
    }
    if (diff && input.updatedBy === 'user' && updated.status === 'updated') {
      updated.status = 'draft';
    }
  } else {
    updated.updatedAt = now;
  }

  current.plans[planIndex] = updated;
  await persistPlansFile(paths, current);
  return updated;
}

export async function deletePlan(options: PlanStoreOptions & { id: string }): Promise<void> {
  const paths = resolvePlanPaths(options);
  const current = await loadPlansFile(paths);
  const nextPlans = current.plans.filter((plan) => plan.id !== options.id);
  current.plans = nextPlans;
  await persistPlansFile(paths, current);
}
