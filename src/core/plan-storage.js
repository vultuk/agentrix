import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

export async function savePlanToWorktree({
  worktreePath,
  branch,
  planText,
  clock = () => new Date(),
}) {
  const resolvedWorktreePath = typeof worktreePath === 'string' ? worktreePath.trim() : '';
  if (!resolvedWorktreePath) {
    throw new Error('worktreePath is required');
  }
  const resolvedPlanText = typeof planText === 'string' ? planText : '';
  if (!resolvedPlanText.trim()) {
    return null;
  }

  const timestamp = formatTimestampPart(clock());
  const safeBranch = normaliseBranchName(branch);
  const directory = join(resolvedWorktreePath, '.plans');
  const filename = `${timestamp}-${safeBranch}.md`;
  const filePath = join(directory, filename);

  await mkdir(directory, { recursive: true });
  const content = ensureTrailingNewline(resolvedPlanText);
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

export const _internals = {
  formatTimestampPart,
  normaliseBranchName,
  ensureTrailingNewline,
};
