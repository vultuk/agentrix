import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface PlanEntry {
  id: string;
  branch: string;
  createdAt: string;
}

export interface PlanDetails extends PlanEntry {
  content: string;
}

export interface SavePlanOptions {
  worktreePath: string;
  branch: string;
  planText: string;
  clock?: () => Date;
  gitAdd?: (cwd: string) => Promise<void>;
  maxPlansPerBranch?: number;
}

export interface ListPlansOptions {
  worktreePath: string;
  branch: string;
  limit?: number;
}

export interface ReadPlanOptions {
  worktreePath: string;
  branch: string;
  id: string;
}

interface ParsedPlanFilename {
  id: string;
  branchSuffix: string;
  createdAt: Date;
}

function formatTimestampPart(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Invalid date supplied to formatTimestamp');
  }
  const iso = date.toISOString();
  const [datePart, timePart] = iso.split('T');
  const compactDate = datePart!.replace(/-/g, '');
  const compactTime = timePart!.slice(0, 8).replace(/:/g, '');
  return `${compactDate}_${compactTime}`;
}

function normaliseBranchName(branch: string): string {
  const value = typeof branch === 'string' ? branch.trim() : '';
  if (!value) {
    throw new Error('Branch name is required');
  }
  return value.replace(/[^0-9A-Za-z._-]/g, '_');
}

function ensureTrailingNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

const DEFAULT_MAX_PLANS_PER_BRANCH = 20;

async function gitAddPlans(cwd: string): Promise<void> {
  await execFileAsync('git', ['add', '-A', '.plans'], { cwd });
}

function parsePlanFilename(filename: string): ParsedPlanFilename | null {
  if (typeof filename !== 'string') {
    return null;
  }

  const trimmed = filename.trim();
  if (!trimmed.endsWith('.md')) {
    return null;
  }

  const hyphenIndex = trimmed.indexOf('-');
  if (hyphenIndex === -1) {
    return null;
  }

  const timestampPart = trimmed.slice(0, hyphenIndex);
  const branchPart = trimmed.slice(hyphenIndex + 1, -'.md'.length);
  if (!timestampPart || !branchPart) {
    return null;
  }

  const timestampMatch = timestampPart.match(/^(\d{8})_(\d{6})$/);
  if (!timestampMatch) {
    return null;
  }

  const [, datePart, timePart] = timestampMatch;
  const year = Number.parseInt(datePart!, 10);
  const month = Number.parseInt(datePart!.slice(4, 6), 10) - 1;
  const day = Number.parseInt(datePart!.slice(6, 8), 10);
  const hour = Number.parseInt(timePart!, 10);
  const minute = Number.parseInt(timePart!.slice(2, 4), 10);
  const second = Number.parseInt(timePart!.slice(4, 6), 10);
  const createdAt = new Date(Date.UTC(year, month, day, hour, minute, second));
  if (Number.isNaN(createdAt.getTime())) {
    return null;
  }

  return {
    id: trimmed,
    branchSuffix: branchPart,
    createdAt,
  };
}

async function prunePlans(directory: string, branchSuffix: string, maxCount: number): Promise<void> {
  if (!maxCount || maxCount <= 0) {
    return;
  }

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err && err.code === 'ENOENT') {
      return;
    }
    throw error;
  }

  const matching = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(`-${branchSuffix}.md`))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (matching.length <= maxCount) {
    return;
  }

  const toRemove = matching.slice(0, matching.length - maxCount);
  await Promise.all(
    toRemove.map(async (name) => {
      const filePath = join(directory, name);
      try {
        await unlink(filePath);
      } catch (error: unknown) {
        const err = error as { code?: string };
        if (!err || err.code !== 'ENOENT') {
          throw error;
        }
      }
    })
  );
}

export async function savePlanToWorktree({
  worktreePath,
  branch,
  planText,
  clock = () => new Date(),
  gitAdd = gitAddPlans,
  maxPlansPerBranch = DEFAULT_MAX_PLANS_PER_BRANCH,
}: SavePlanOptions): Promise<string | null> {
  const resolvedWorktreePath = typeof worktreePath === 'string' ? worktreePath.trim() : '';
  if (!resolvedWorktreePath) {
    throw new Error('worktreePath is required');
  }
  const resolvedPlanText = typeof planText === 'string' ? planText : '';
  if (!resolvedPlanText.trim()) {
    return null;
  }

  const safeBranch = normaliseBranchName(branch);
  const directory = join(resolvedWorktreePath, '.plans');
  const branchSuffix = `-${safeBranch}.md`;
  const content = ensureTrailingNewline(resolvedPlanText);

  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const matching = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(branchSuffix))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
    const latestName = matching.length > 0 ? matching[matching.length - 1] : null;
    if (latestName) {
      const existingPath = join(directory, latestName);
      try {
        const existingContent = await readFile(existingPath, 'utf8');
        if (existingContent === content) {
          return existingPath;
        }
      } catch (error: unknown) {
        const err = error as { code?: string };
        if (!err || err.code !== 'ENOENT') {
          throw error;
        }
      }
    }
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (!err || err.code !== 'ENOENT') {
      throw error;
    }
  }

  const timestamp = formatTimestampPart(clock());
  const filename = `${timestamp}-${safeBranch}.md`;
  const filePath = join(directory, filename);

  await mkdir(directory, { recursive: true });
  await writeFile(filePath, content, 'utf8');
  await prunePlans(directory, safeBranch, maxPlansPerBranch);
  if (typeof gitAdd === 'function') {
    await gitAdd(resolvedWorktreePath);
  }
  return filePath;
}

export async function listPlansForWorktree({
  worktreePath,
  branch,
  limit,
}: ListPlansOptions): Promise<PlanEntry[]> {
  const resolvedWorktreePath = typeof worktreePath === 'string' ? worktreePath.trim() : '';
  if (!resolvedWorktreePath) {
    throw new Error('worktreePath is required');
  }
  const safeBranch = normaliseBranchName(branch);
  if (!safeBranch) {
    throw new Error('branch is required');
  }

  const directory = join(resolvedWorktreePath, '.plans');
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err && err.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const suffix = `-${safeBranch}.md`;
  const plans = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => parsePlanFilename(entry.name))
    .filter((parsed): parsed is ParsedPlanFilename => parsed !== null)
    .map((parsed) => ({
      id: parsed.id,
      branch: safeBranch,
      createdAt: parsed.createdAt.toISOString(),
    }))
    .sort((a, b) => b.id.localeCompare(a.id));

  if (Number.isInteger(limit) && limit! > 0 && plans.length > limit!) {
    return plans.slice(0, limit);
  }
  return plans;
}

export async function readPlanFromWorktree({
  worktreePath,
  branch,
  id,
}: ReadPlanOptions): Promise<PlanDetails> {
  const resolvedWorktreePath = typeof worktreePath === 'string' ? worktreePath.trim() : '';
  if (!resolvedWorktreePath) {
    throw new Error('worktreePath is required');
  }
  const safeBranch = normaliseBranchName(branch);
  if (!safeBranch) {
    throw new Error('branch is required');
  }

  const planId = typeof id === 'string' ? id.trim() : '';
  if (!planId || planId.includes('/') || planId.includes('..')) {
    throw new Error('Invalid plan identifier');
  }

  const parsed = parsePlanFilename(planId);
  if (!parsed || parsed.branchSuffix !== safeBranch) {
    throw new Error('Plan not found');
  }

  const directory = join(resolvedWorktreePath, '.plans');
  const filePath = join(directory, planId);

  let content;
  try {
    content = await readFile(filePath, 'utf8');
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err && err.code === 'ENOENT') {
      throw new Error('Plan not found');
    }
    throw error;
  }

  return {
    id: planId,
    branch: safeBranch,
    createdAt: parsed.createdAt.toISOString(),
    content,
  };
}

export const _internals = {
  formatTimestampPart,
  normaliseBranchName,
  ensureTrailingNewline,
  parsePlanFilename,
};
