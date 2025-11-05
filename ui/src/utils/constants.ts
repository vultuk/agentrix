export const DEFAULT_COMMAND_CONFIG = Object.freeze({
  codex: 'codex',
  codexDangerous: 'codex --dangerously-bypass-approvals-and-sandbox',
  claude: 'claude',
  claudeDangerous: 'claude --dangerously-skip-permissions',
  cursor: 'cursor-agent',
  vscode: 'code .'
});

export const WORKTREE_LAUNCH_OPTIONS = Object.freeze([
  { value: 'terminal', label: 'Terminal' },
  { value: 'vscode', label: 'VS Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'claude', label: 'Claude' },
  { value: 'cursor', label: 'Cursor' }
]);

export const PROMPT_AGENT_OPTIONS = Object.freeze([
  { value: 'codex', label: 'Codex' },
  { value: 'claude', label: 'Claude' },
  { value: 'cursor', label: 'Cursor' }
]);

export const ISSUE_PLAN_PROMPT_TEMPLATE = `Using the gh command, load the specified GitHub issue and produce a structured plan to resolve or implement it.

1. **Load the issue context**
   - Retrieve the issue and its comments using:
     \`gh issue view <ISSUE_NUMBER> --comments --json title,body,comments,author,url\`
   - Parse and analyse:
      • The main issue description and intent.  
      • All comments and discussion for clarifications or context.  
      • Any related links, dependencies, or blockers.

2. **Analyse and understand**
   - Determine the core objective or bug to fix.  
   - Identify the affected components, modules, or systems.  
   - Extract any proposed solutions or developer notes.  
   - Spot missing information or ambiguities that require assumption or clarification.

3. **Generate a plan of action**
   - Draft a clear, technical, and step-by-step plan including:
      • **Summary:** One-sentence goal of the issue.  
      • **Analysis:** Understanding of the root cause or feature requirements.  
      • **Implementation Plan:** Ordered list of code changes, refactors, or new files needed.  
      • **Testing/Validation:** How to verify success.  
      • **Potential Risks / Edge Cases.**

4. **Present and confirm**
   - Output the full plan directly into this chat.  
   - Wait for confirmation before taking any further automated action.

Ensure the plan is specific, technically sound, and ready for execution.`;

export const PROMPT_EDITOR_TABS = Object.freeze([
  { value: 'edit', label: 'Edit' },
  { value: 'preview', label: 'Preview' }
]);

export const REPOSITORY_POLL_INTERVAL_MS = 60000;
export const REPOSITORY_DASHBOARD_POLL_INTERVAL_MS = 60000;
export const SESSION_POLL_INTERVAL_MS = 60000;

export const ORGANISATION_COLLAPSE_STORAGE_KEY = 'terminal-worktree:collapsed-organisations';

export const TASK_STATUS_LABELS = Object.freeze({
  pending: 'Pending',
  running: 'Running',
  succeeded: 'Completed',
  failed: 'Failed',
  skipped: 'Skipped',
});

export const TASK_STATUS_BADGE_CLASSES = Object.freeze({
  pending: 'bg-neutral-700/60 text-neutral-200',
  running: 'bg-sky-500/20 text-sky-300',
  succeeded: 'bg-emerald-500/20 text-emerald-300',
  failed: 'bg-rose-500/20 text-rose-200',
  skipped: 'bg-neutral-700/40 text-neutral-300',
});

export const TASK_STATUS_INDICATOR_CLASSES = Object.freeze({
  pending: 'bg-neutral-500/70',
  running: 'bg-sky-400',
  succeeded: 'bg-emerald-400',
  failed: 'bg-rose-500',
  skipped: 'bg-neutral-600/80',
});

export const ACTION_BUTTON_CLASS = 'inline-flex h-7 w-7 items-center justify-center rounded-md shrink-0 transition-colors';

export const ACKNOWLEDGEMENT_ACTIVITY_TOLERANCE_MS = 1500;

