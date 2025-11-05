import { ISSUE_PLAN_PROMPT_TEMPLATE } from '../../utils/constants.js';
import type { Issue } from '../../types/domain.js';

interface Repository {
  org: string;
  repo: string;
}

/**
 * Generate a plan prompt from an issue
 */
export function generateIssuePlanPrompt(issue: Issue | null, repository: Repository | null): string {
  if (!issue || !repository) {
    return ISSUE_PLAN_PROMPT_TEMPLATE;
  }

  const issueNumber = issue.number;
  const promptValue = ISSUE_PLAN_PROMPT_TEMPLATE.replace(
    /<ISSUE_NUMBER>/g,
    String(issueNumber || '')
  );

  return promptValue;
}

/**
 * Format plan timestamp for display
 */
export function formatPlanTimestamp(isoString: string | null | undefined): string {
  if (!isoString || typeof isoString !== 'string') {
    return '';
  }
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

