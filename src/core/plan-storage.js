import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function formatTimestampPart(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error('Invalid date supplied to formatTimestamp');
  }
  const iso = date.toISOString();
  const [datePart, timePart] = iso.split('T');
  const compactDate = datePart.replace(/-/g, '');
  const compactTime = timePart.slice(0, 8).replace(/:/g, '');
  return `${compactDate}_${compactTime}`;
}

function normaliseBranchName(branch) {
  const value = typeof branch === 'string' ? branch.trim() : '';
  if (!value) {
    throw new Error('Branch name is required');
  }
  return value.replace(/[^0-9A-Za-z._-]/g, '_');
}

function ensureTrailingNewline(text) {
  return text.endsWith('\n') ? text : `${text}\n`;
}

async function gitAddPlans(cwd) {
  await execFileAsync('git', ['add', '-A', '.plans'], { cwd });
}

export async function savePlanToWorktree({
  worktreePath,
  branch,
  planText,
  clock = () => new Date(),
  gitAdd = gitAddPlans,
}) {
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
      } catch (error) {
        if (!error || error.code !== 'ENOENT') {
          throw error;
        }
      }
    }
  } catch (error) {
    if (!error || error.code !== 'ENOENT') {
      throw error;
    }
  }

  const timestamp = formatTimestampPart(clock());
  const filename = `${timestamp}-${safeBranch}.md`;
  const filePath = join(directory, filename);

  await mkdir(directory, { recursive: true });
  await writeFile(filePath, content, 'utf8');
  if (typeof gitAdd === 'function') {
    await gitAdd(resolvedWorktreePath);
  }
  return filePath;
}

export const _internals = {
  formatTimestampPart,
  normaliseBranchName,
  ensureTrailingNewline,
};
