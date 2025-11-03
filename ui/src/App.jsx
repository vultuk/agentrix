import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Resizable } from 're-resizable';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import {
  ChevronDown,
  Github,
  GitBranch,
  Menu,
  RefreshCcw,
  Plus,
  Sparkles,
  Settings,
  Trash2,
  X,
  ScrollText,
  ListTodo,
  Loader2,
} from 'lucide-react';

import 'xterm/css/xterm.css';
import { renderMarkdown } from './utils/markdown';
import GitStatusSidebar from './components/GitStatusSidebar.jsx';
import DiffViewer from './components/DiffViewer.jsx';
import RepositoryDashboard from './components/RepositoryDashboard.jsx';
import { createEventStream } from './utils/eventStream.js';

const { createElement: h } = React;

const DEFAULT_COMMAND_CONFIG = Object.freeze({
  codex: 'codex',
  codexDangerous: 'codex --dangerously-bypass-approvals-and-sandbox',
  claude: 'claude',
  claudeDangerous: 'claude --dangerously-skip-permissions',
  cursor: 'cursor-agent',
  vscode: 'code .'
});

const WORKTREE_LAUNCH_OPTIONS = Object.freeze([
  { value: 'terminal', label: 'Terminal' },
  { value: 'vscode', label: 'VS Code' },
  { value: 'codex', label: 'Codex' },
  { value: 'claude', label: 'Claude' },
  { value: 'cursor', label: 'Cursor' }
]);

const PROMPT_AGENT_OPTIONS = Object.freeze([
  { value: 'codex', label: 'Codex' },
  { value: 'claude', label: 'Claude' },
  { value: 'cursor', label: 'Cursor' }
]);

const ISSUE_PLAN_PROMPT_TEMPLATE = `Using the gh command, load the specified GitHub issue and produce a structured plan to resolve or implement it.

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

const createEmptyPlanModalState = () => ({
  open: false,
  loading: false,
  error: null,
  plans: [],
  selectedPlanId: null,
  content: '',
  contentLoading: false,
  contentError: null,
  context: null
});

const PROMPT_EDITOR_TABS = Object.freeze([
  { value: 'edit', label: 'Edit' },
  { value: 'preview', label: 'Preview' }
]);

const REPOSITORY_POLL_INTERVAL_MS = 60000;
const REPOSITORY_DASHBOARD_POLL_INTERVAL_MS = 60000;
const SESSION_POLL_INTERVAL_MS = 60000;

const ORGANISATION_COLLAPSE_STORAGE_KEY = 'terminal-worktree:collapsed-organisations';

const TASK_STATUS_LABELS = Object.freeze({
  pending: 'Pending',
  running: 'Running',
  succeeded: 'Completed',
  failed: 'Failed',
  skipped: 'Skipped',
});

const TASK_STATUS_BADGE_CLASSES = Object.freeze({
  pending: 'bg-neutral-700/60 text-neutral-200',
  running: 'bg-sky-500/20 text-sky-300',
  succeeded: 'bg-emerald-500/20 text-emerald-300',
  failed: 'bg-rose-500/20 text-rose-200',
  skipped: 'bg-neutral-700/40 text-neutral-300',
});

const TASK_STATUS_INDICATOR_CLASSES = Object.freeze({
  pending: 'bg-neutral-500/70',
  running: 'bg-sky-400',
  succeeded: 'bg-emerald-400',
  failed: 'bg-rose-500',
  skipped: 'bg-neutral-600/80',
});

const ACTION_BUTTON_CLASS = 'inline-flex h-7 w-7 items-center justify-center rounded-md shrink-0 transition-colors';

const ACKNOWLEDGEMENT_ACTIVITY_TOLERANCE_MS = 1500;

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const parseActivityTimestamp = (value) => {
  if (isFiniteNumber(value)) {
    return value;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

function normaliseIdleAcknowledgementEntry(value) {
  if (value && typeof value === 'object') {
    const acknowledgedAt = isFiniteNumber(value.acknowledgedAt) ? value.acknowledgedAt : Date.now();
    const lastSeenActivityMs = isFiniteNumber(value.lastSeenActivityMs)
      ? value.lastSeenActivityMs
      : null;
    if (
      acknowledgedAt === value.acknowledgedAt &&
      lastSeenActivityMs === value.lastSeenActivityMs
    ) {
      return value;
    }
    return { acknowledgedAt, lastSeenActivityMs };
  }
  if (isFiniteNumber(value)) {
    return { acknowledgedAt: value, lastSeenActivityMs: null };
  }
  return { acknowledgedAt: Date.now(), lastSeenActivityMs: null };
}

function createIdleAcknowledgementEntry(lastActivityAtMs) {
  return {
    acknowledgedAt: Date.now(),
    lastSeenActivityMs: isFiniteNumber(lastActivityAtMs) ? lastActivityAtMs : null,
  };
}

function getMetadataLastActivityMs(metadata) {
  if (!metadata) {
    return null;
  }
  if (isFiniteNumber(metadata.lastActivityAtMs)) {
    return metadata.lastActivityAtMs;
  }
  return parseActivityTimestamp(metadata.lastActivityAt);
}

function isIdleAcknowledgementCurrent(metadata, acknowledgement) {
  if (!acknowledgement) {
    return false;
  }
  const entry = normaliseIdleAcknowledgementEntry(acknowledgement);
  if (!isFiniteNumber(entry.acknowledgedAt)) {
    return false;
  }
  const metadataLastActivityMs = getMetadataLastActivityMs(metadata);
  if (!isFiniteNumber(metadataLastActivityMs)) {
    return true;
  }
  return metadataLastActivityMs <= entry.acknowledgedAt + ACKNOWLEDGEMENT_ACTIVITY_TOLERANCE_MS;
}

function Modal({ title, onClose, children, size = 'md', position = 'center' }) {
        const content = Array.isArray(children) ? children : [children];
        const alignmentClass = position === 'top' ? 'items-start' : 'items-center';
        const wrapperSpacingClass = position === 'top' ? 'mt-10' : '';
        const maxWidthClass = size === 'lg' ? 'max-w-[90vw]' : 'max-w-md';
        return h(
          'div',
          {
            className: [
              'fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center z-50 p-4',
              alignmentClass
            ]
              .filter(Boolean)
              .join(' '),
            onClick: onClose
          },
          h(
            'div',
            {
              className: [
                'bg-neutral-900 border border-neutral-700 rounded-lg w-full shadow-xl max-h-[90vh] flex flex-col overflow-hidden',
                maxWidthClass,
                wrapperSpacingClass
              ]
                .filter(Boolean)
                .join(' '),
              onClick: event => event.stopPropagation()
            },
            h(
              'div',
              { className: 'flex items-center justify-between px-4 py-3 border-b border-neutral-800' },
              h('h2', { className: 'text-sm font-semibold text-neutral-100' }, title),
              h(
                'button',
                {
                  type: 'button',
                  onClick: onClose,
                  className: 'text-neutral-500 hover:text-neutral-200 transition-colors'
                },
                h(X, { size: 16 })
              )
            ),
            h(
              'div',
              { className: 'px-4 py-4 space-y-3 flex-1 overflow-y-auto min-h-0 flex flex-col' },
              ...content
            )
          )
        );
      }

function LoginScreen({ onAuthenticated }) {
        const [password, setPassword] = useState('');
        const [error, setError] = useState(null);
        const [isSubmitting, setIsSubmitting] = useState(false);
        const inputRef = useRef(null);

        useEffect(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
        }, []);

        const handleSubmit = useCallback(
          async (event) => {
            event.preventDefault();
            if (isSubmitting) {
              return;
            }
            const trimmed = password.trim();
            if (!trimmed) {
              setError('Password is required.');
              return;
            }
            setIsSubmitting(true);
            setError(null);
            try {
              const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ password: trimmed })
              });
              if (response.ok) {
                setPassword('');
                if (typeof onAuthenticated === 'function') {
                  onAuthenticated();
                }
                return;
              }
              if (response.status === 401) {
                setError('Incorrect password. Try again.');
                return;
              }
              let message = 'Login failed. Please try again.';
              try {
                const data = await response.json();
                if (data && typeof data.error === 'string') {
                  message = data.error;
                }
              } catch {}
              setError(message);
            } catch {
              setError('Unable to reach the server. Ensure terminal-worktree is running.');
            } finally {
              setIsSubmitting(false);
            }
          },
          [isSubmitting, password, onAuthenticated]
        );

        return h(
          'div',
          {
            className:
              'min-h-screen bg-neutral-950 flex items-center justify-center px-4 text-neutral-100'
          },
          h(
            'div',
            {
              className:
                'w-full max-w-sm space-y-6 rounded-lg border border-neutral-800 bg-neutral-900/90 p-6 shadow-xl'
            },
            h(
              'div',
              { className: 'space-y-1' },
              h('h1', { className: 'text-lg font-semibold text-neutral-50' }, 'terminal-worktree'),
              h(
                'p',
                { className: 'text-sm text-neutral-400' },
                'Enter the password printed by the CLI to continue.'
              )
            ),
            h(
              'form',
              {
                className: 'space-y-4',
                onSubmit: handleSubmit
              },
              h(
                'div',
                { className: 'space-y-2' },
                h(
                  'label',
                  { className: 'block text-xs uppercase tracking-wide text-neutral-400' },
                  'Password'
                ),
                h('input', {
                  ref: inputRef,
                  type: 'password',
                  value: password,
                  onChange: (event) => {
                    setPassword(event.target.value);
                    if (error) {
                      setError(null);
                    }
                  },
                  autoComplete: 'current-password',
                  placeholder: 'Paste password here',
                  className:
                    'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60'
                })
              ),
              error ? h('p', { className: 'text-xs text-rose-300' }, error) : null,
              h(
                'button',
                {
                  type: 'submit',
                  disabled: isSubmitting,
                  className:
                    'w-full inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500/80 px-4 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-65'
                },
                isSubmitting ? 'Logging in…' : 'Log in'
              )
            )
          )
        );
      }

function formatLogTimestamp(value) {
        if (!value) {
          return '';
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
          return '';
        }
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }

function TaskMenu({ tasks, isOpen, onToggle, hasRunning, menuRef }) {
        const taskList = Array.isArray(tasks) ? tasks : [];
        const runningCount = taskList.reduce((total, task) => {
          if (task && (task.status === 'pending' || task.status === 'running')) {
            return total + 1;
          }
          return total;
        }, 0);

        const totalCount = taskList.length;
        const dropdownContent = totalCount
          ? taskList.map((task) => renderTaskCard(task))
          : h(
              'div',
              { className: 'px-4 py-6 text-sm text-neutral-400 text-center' },
              'No tasks have been recorded yet.',
            );

        return h(
          'div',
          { className: 'relative', ref: menuRef },
          h(
            'button',
            {
              type: 'button',
              onClick: onToggle,
              className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`,
              'aria-haspopup': 'true',
              'aria-expanded': isOpen ? 'true' : 'false',
              title: runningCount
                ? `${runningCount} task${runningCount === 1 ? '' : 's'} in progress`
                : totalCount
                ? `${totalCount} recent task${totalCount === 1 ? '' : 's'}`
                : 'No tasks running',
            },
            hasRunning
              ? h(Loader2, { size: 16, className: 'animate-spin text-emerald-400' })
              : h(ListTodo, { size: 16 }),
          ),
          isOpen
            ? h(
                'div',
                {
                  className:
                    'absolute right-0 top-full mt-2 w-[24rem] max-h-[70vh] overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl z-40',
                },
                h(
                  'div',
                  {
                    className:
                      'flex items-center justify-between border-b border-neutral-800 bg-neutral-900/70 px-4 py-3',
                  },
                  h(
                    'div',
                    null,
                    h('p', { className: 'text-sm font-medium text-neutral-100' }, 'Tasks'),
                    h(
                      'p',
                      { className: 'text-xs text-neutral-400' },
                      runningCount
                        ? `${runningCount} running • ${totalCount} total`
                        : `${totalCount} total`,
                    ),
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: onToggle,
                      className: 'rounded-md p-1 text-neutral-400 transition hover:text-neutral-100',
                      'aria-label': 'Close tasks menu',
                    },
                    h(X, { size: 16 }),
                  ),
                ),
                h('div', { className: 'space-y-3 px-3 py-4' }, dropdownContent),
              )
            : null,
        );
      }

function renderTaskCard(task) {
        if (!task || typeof task !== 'object') {
          return null;
        }

        const status = task.status || 'pending';
        const badgeClass = TASK_STATUS_BADGE_CLASSES[status] || TASK_STATUS_BADGE_CLASSES.pending;
        const statusLabel = TASK_STATUS_LABELS[status] || status;
        const metadata = task.metadata || {};
        const result = task.result || {};
        const org = typeof metadata.org === 'string' ? metadata.org : result.org || '';
        const repo = typeof metadata.repo === 'string' ? metadata.repo : result.repo || '';
        const branch =
          (typeof result.branch === 'string' && result.branch) ||
          (typeof metadata.branch === 'string' && metadata.branch) ||
          '';
        const titleParts = [];
        if (org && repo) {
          titleParts.push(`${org}/${repo}`);
        } else {
          titleParts.push('Automation task');
        }
        if (branch) {
          titleParts.push(`#${branch}`);
        }
        const title = titleParts.join(' ');
        const createdAt = task.createdAt ? formatLogTimestamp(task.createdAt) : '';
        const steps = Array.isArray(task.steps) ? task.steps : [];

        return h(
          'div',
          { key: task.id, className: 'rounded-lg border border-neutral-800/70 bg-neutral-900/55 shadow-inner' },
          h(
            'div',
            { className: 'flex items-center justify-between border-b border-neutral-800/70 px-4 py-3' },
            h(
              'div',
              { className: 'space-y-0.5' },
              h('p', { className: 'text-sm font-medium text-neutral-100' }, title || `Task ${task.id}`),
              createdAt
                ? h('p', { className: 'text-xs text-neutral-400' }, `Started ${createdAt}`)
                : null,
            ),
            h(
              'span',
              { className: `rounded-full px-2 py-1 text-xs font-medium ${badgeClass}` },
              statusLabel,
            ),
          ),
          h(
            'div',
            { className: 'space-y-3 px-3 py-3' },
            steps.length
              ? steps.map((step, index) => renderTaskStep(step, index))
              : h('p', { className: 'text-xs text-neutral-400' }, 'No steps reported yet.'),
            status === 'failed' && task.error && task.error.message
              ? h(
                  'div',
                  {
                    className:
                      'rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200',
                  },
                  task.error.message,
                )
              : null,
          ),
        );
      }

function renderTaskStep(step, index) {
        if (!step || typeof step !== 'object') {
          return null;
        }
        const status = step.status || 'pending';
        const indicatorClass =
          TASK_STATUS_INDICATOR_CLASSES[status] || TASK_STATUS_INDICATOR_CLASSES.pending;
        const label = step.label || `Step ${index + 1}`;
        const statusLabel = TASK_STATUS_LABELS[status] || status;
        const logs = Array.isArray(step.logs) ? step.logs : [];
        const isDefaultOpen = status === 'running' || status === 'failed';

        return h(
          'details',
          {
            key: step.id || `${label}-${index}`,
            className: 'group rounded-md border border-neutral-800/60 bg-neutral-900/45',
            open: isDefaultOpen,
          },
          h(
            'summary',
            {
              className:
                'flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm text-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/40',
            },
            h('span', { className: `h-2.5 w-2.5 flex-shrink-0 rounded-full ${indicatorClass}` }),
            h(
              'span',
              { className: 'flex-1 text-xs font-medium uppercase tracking-wide text-neutral-300' },
              label,
            ),
            h('span', { className: 'text-xs text-neutral-400' }, statusLabel),
            h(ChevronDown, {
              size: 14,
              className: 'text-neutral-500 transition-transform group-open:rotate-180',
            }),
          ),
          h(
            'div',
            { className: 'space-y-1 px-3 pb-3 pt-2 text-xs text-neutral-300' },
            logs.length
              ? logs.map((log, logIndex) =>
                  h(
                    'div',
                    {
                      key: log && log.id ? log.id : `${step.id || index}-log-${logIndex}`,
                      className: 'flex gap-2',
                    },
                    h('span', { className: 'min-w-[4.5rem] text-neutral-500' }, formatLogTimestamp(log?.timestamp)),
                    h('span', { className: 'flex-1' }, log?.message || ''),
                  ),
                )
              : h('p', { className: 'text-neutral-500' }, 'No updates yet.'),
          ),
        );
      }

      function RepoBrowser({ onAuthExpired, onLogout, isLoggingOut } = {}) {
        const [width, setWidth] = useState(340);
        const [data, setData] = useState({});
        const [showAddRepoModal, setShowAddRepoModal] = useState(false);
        const [repoUrl, setRepoUrl] = useState('');
        const [repoInitCommand, setRepoInitCommand] = useState('');
        const [showWorktreeModal, setShowWorktreeModal] = useState(false);
        const [selectedRepo, setSelectedRepo] = useState(null);
        const [branchName, setBranchName] = useState('');
        const [worktreeLaunchOption, setWorktreeLaunchOption] = useState('terminal');
        const [launchDangerousMode, setLaunchDangerousMode] = useState(false);
        const [showPromptWorktreeModal, setShowPromptWorktreeModal] = useState(false);
        const [promptText, setPromptText] = useState('');
        const [promptAgent, setPromptAgent] = useState('codex');
        const [promptDangerousMode, setPromptDangerousMode] = useState(false);
        const [promptInputMode, setPromptInputMode] = useState('edit');
        const [activeWorktree, setActiveWorktree] = useState(null);
        const [confirmDelete, setConfirmDelete] = useState(null);
        const [confirmDeleteRepo, setConfirmDeleteRepo] = useState(null);
        const [terminalStatus, setTerminalStatus] = useState('disconnected');
        const [sessionId, setSessionId] = useState(null);
        const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
        const [pendingWorktreeAction, setPendingWorktreeAction] = useState(null);
        const [isAddingRepo, setIsAddingRepo] = useState(false);
        const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
        const [isDeletingWorktree, setIsDeletingWorktree] = useState(false);
        const [isDeletingRepo, setIsDeletingRepo] = useState(false);
        const [isCreatingPromptWorktree, setIsCreatingPromptWorktree] = useState(false);
        const [isCreatingPlan, setIsCreatingPlan] = useState(false);
        const [pendingActionLoading, setPendingActionLoading] = useState(null);
        const [openActionMenu, setOpenActionMenu] = useState(null);
        const [tasks, setTasks] = useState([]);
        const [isTaskMenuOpen, setIsTaskMenuOpen] = useState(false);
        const taskMapRef = useRef(new Map());
        const pendingLaunchesRef = useRef(new Map());
        const taskMenuRef = useRef(null);
        const hasRunningTasks = useMemo(
          () => tasks.some((task) => task && (task.status === 'pending' || task.status === 'running')),
          [tasks],
        );
        const [commandConfig, setCommandConfig] = useState(DEFAULT_COMMAND_CONFIG);
        const [editInitCommandModal, setEditInitCommandModal] = useState({
          open: false,
          org: null,
          repo: null,
          value: '',
          error: null,
          saving: false,
        });
        const [collapsedOrganisations, setCollapsedOrganisations] = useState(() => {
          if (typeof window === 'undefined') {
            return {};
          }
          try {
            const stored = window.localStorage.getItem(ORGANISATION_COLLAPSE_STORAGE_KEY);
            if (!stored) {
              return {};
            }
            const parsed = JSON.parse(stored);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              return Object.fromEntries(
                Object.entries(parsed).map(([key, value]) => [key, Boolean(value)])
              );
            }
          } catch (error) {
            console.warn('Failed to restore organisation collapse state', error);
          }
          return {};
        });
        const [gitDiffModal, setGitDiffModal] = useState(() => ({
          open: false,
          loading: false,
          error: null,
          diff: '',
          file: null,
          view:
            typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
              ? 'unified'
              : 'split',
        }));
        const [planModal, setPlanModal] = useState(() => createEmptyPlanModalState());
        const [gitSidebarState, setGitSidebarState] = useState({});
        const [activeRepoDashboard, setActiveRepoDashboard] = useState(null);
        const [dashboardData, setDashboardData] = useState(null);
        const [dashboardError, setDashboardError] = useState(null);
        const [isDashboardLoading, setIsDashboardLoading] = useState(false);
        const dashboardCacheRef = useRef(new Map());
        const dashboardPollingRef = useRef({ timerId: null, controller: null });

        const getRepoInitCommandValue = (org, repo) => {
          const repoInfo = data?.[org]?.[repo];
          if (repoInfo && typeof repoInfo.initCommand === 'string') {
            return repoInfo.initCommand;
          }
          return '';
        };

        const openRepoSettings = (org, repo, initCommandValue = '') => {
          if (!org || !repo) {
            return;
          }
          setEditInitCommandModal({
            open: true,
            org,
            repo,
            value: typeof initCommandValue === 'string' ? initCommandValue : '',
            error: null,
            saving: false,
          });
        };

        const openPromptModalForRepo = useCallback((org, repo) => {
          if (!org || !repo) {
            return;
          }
          setSelectedRepo([org, repo]);
          setPromptText('');
          setPromptAgent('codex');
          setPromptDangerousMode(false);
          setPromptInputMode('edit');
          setShowPromptWorktreeModal(true);
          setOpenActionMenu(null);
          setIsMobileMenuOpen(false);
        }, [
          setSelectedRepo,
          setPromptText,
          setPromptAgent,
          setPromptDangerousMode,
          setPromptInputMode,
          setShowPromptWorktreeModal,
          setOpenActionMenu,
          setIsMobileMenuOpen,
        ]);

        const openWorktreeModalForRepo = useCallback((org, repo) => {
          if (!org || !repo) {
            return;
          }
          setSelectedRepo([org, repo]);
          setBranchName('');
          setWorktreeLaunchOption('terminal');
          setLaunchDangerousMode(false);
          setShowWorktreeModal(true);
          setOpenActionMenu(null);
          setIsMobileMenuOpen(false);
        }, [
          setSelectedRepo,
          setBranchName,
          setWorktreeLaunchOption,
          setLaunchDangerousMode,
          setShowWorktreeModal,
          setOpenActionMenu,
          setIsMobileMenuOpen,
        ]);


        const reopenRepoSettingsAfterConfirm = (dialogState) => {
          if (
            !dialogState ||
            !dialogState.reopenSettings ||
            !dialogState.org ||
            !dialogState.repo
          ) {
            return;
          }
          const draftValue =
            typeof dialogState.initCommandDraft === 'string'
              ? dialogState.initCommandDraft
              : getRepoInitCommandValue(dialogState.org, dialogState.repo);
          openRepoSettings(dialogState.org, dialogState.repo, draftValue);
        };

        const clearDashboardPolling = useCallback(() => {
          if (dashboardPollingRef.current.timerId !== null && typeof window !== 'undefined') {
            window.clearInterval(dashboardPollingRef.current.timerId);
          }
          if (dashboardPollingRef.current.controller) {
            dashboardPollingRef.current.controller.abort();
          }
          dashboardPollingRef.current = { timerId: null, controller: null };
        }, []);

        const actionMenuRefs = useRef(new Map());
        const githubMenuRef = useRef(null);
        const [isGithubMenuOpen, setIsGithubMenuOpen] = useState(false);
        const activeWorktreeRef = useRef(null);

        const getActionMenuRef = useCallback(
          (action) => (node) => {
            if (node) {
              actionMenuRefs.current.set(action, node);
            } else {
              actionMenuRefs.current.delete(action);
            }
          },
          []
        );

        const toggleGithubMenu = useCallback(() => {
          setIsGithubMenuOpen((current) => !current);
        }, []);

        const closeGithubMenu = useCallback(() => {
          setIsGithubMenuOpen(false);
        }, []);

        const toggleTaskMenu = useCallback(() => {
          setIsTaskMenuOpen((current) => !current);
        }, []);

        const closeTaskMenu = useCallback(() => {
          setIsTaskMenuOpen(false);
        }, []);

        useEffect(() => {
          if (!isTaskMenuOpen) {
            return undefined;
          }
          const handlePointer = (event) => {
            if (taskMenuRef.current && !taskMenuRef.current.contains(event.target)) {
              closeTaskMenu();
            }
          };
          const handleKeydown = (event) => {
            if (event.key === 'Escape') {
              closeTaskMenu();
            }
          };
          document.addEventListener('mousedown', handlePointer);
          document.addEventListener('keydown', handleKeydown);
          return () => {
            document.removeEventListener('mousedown', handlePointer);
            document.removeEventListener('keydown', handleKeydown);
          };
        }, [isTaskMenuOpen, closeTaskMenu]);

        const getCommandForLaunch = useCallback(
          (action, dangerousMode = false) => {
            switch (action) {
              case 'codex':
                return dangerousMode ? commandConfig.codexDangerous : commandConfig.codex;
              case 'claude':
                return dangerousMode ? commandConfig.claudeDangerous : commandConfig.claude;
              case 'ide':
              case 'cursor':
                return commandConfig.cursor;
              case 'vscode':
                return commandConfig.vscode;
              default:
                return undefined;
            }
          },
          [commandConfig]
        );

        useEffect(() => {
          activeWorktreeRef.current = activeWorktree;
        }, [activeWorktree]);

        const toggleActionMenu = useCallback((action) => {
          setOpenActionMenu((current) => (current === action ? null : action));
        }, []);

        const toggleOrganisationCollapsed = useCallback((org) => {
          setCollapsedOrganisations((current) => {
            const next = { ...current };
            if (next[org]) {
              delete next[org];
            } else {
              next[org] = true;
            }
            return next;
          });
        }, []);

        useEffect(() => {
          if (!openActionMenu) {
            return;
          }
          const handleDocumentClick = (event) => {
            const menuNode = actionMenuRefs.current.get(openActionMenu);
            if (menuNode && !menuNode.contains(event.target)) {
              setOpenActionMenu(null);
            }
          };
          const handleEscape = (event) => {
            if (event.key === 'Escape') {
              setOpenActionMenu(null);
            }
          };
          document.addEventListener('mousedown', handleDocumentClick);
          document.addEventListener('keydown', handleEscape);
          return () => {
            document.removeEventListener('mousedown', handleDocumentClick);
            document.removeEventListener('keydown', handleEscape);
          };
        }, [openActionMenu]);

        useEffect(() => {
          if (!isGithubMenuOpen) {
            return;
          }
          const handleDocumentClick = (event) => {
            const menuNode = githubMenuRef.current;
            if (menuNode && !menuNode.contains(event.target)) {
              setIsGithubMenuOpen(false);
            }
          };
          const handleEscape = (event) => {
            if (event.key === 'Escape') {
              setIsGithubMenuOpen(false);
            }
          };
          document.addEventListener('mousedown', handleDocumentClick);
          document.addEventListener('keydown', handleEscape);
          return () => {
            document.removeEventListener('mousedown', handleDocumentClick);
            document.removeEventListener('keydown', handleEscape);
          };
        }, [isGithubMenuOpen]);

        useEffect(() => {
          setIsGithubMenuOpen(false);
        }, [activeWorktree]);

        useEffect(() => {
          if (typeof window === 'undefined') {
            return;
          }
          try {
            window.localStorage.setItem(
              ORGANISATION_COLLAPSE_STORAGE_KEY,
              JSON.stringify(collapsedOrganisations)
            );
          } catch (error) {
            console.warn('Failed to persist organisation collapse state', error);
          }
        }, [collapsedOrganisations]);

        useEffect(() => {
          if (!pendingWorktreeAction) {
            setOpenActionMenu(null);
          }
        }, [pendingWorktreeAction]);

        const notifyAuthExpired = useCallback(() => {
          if (typeof onAuthExpired === 'function') {
            onAuthExpired();
          }
        }, [onAuthExpired]);

        const createPlanFromPrompt = useCallback(
          async (
            promptValue,
            org,
            repo,
            {
              restorePromptOnError = true,
              rawPrompt = false,
              dangerousMode = false,
            } = {},
          ) => {
            if (isCreatingPlan) {
              return;
            }
            const originalPrompt = typeof promptValue === 'string' ? promptValue : '';
            if (!originalPrompt.trim()) {
              return;
            }
            if (!org || !repo) {
              window.alert('Select a repository before creating a plan.');
              return;
            }

            setIsCreatingPlan(true);

            try {
              flushSync(() => {
                setPromptText('');
              });

              const response = await fetch('/api/create-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  prompt: originalPrompt,
                  org,
                  repo,
                  rawPrompt,
                  dangerousMode,
                }),
              });

              if (response.status === 401) {
                if (restorePromptOnError) {
                  flushSync(() => {
                    setPromptText(promptValue);
                  });
                }
                notifyAuthExpired();
                return;
              }

              if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
              }

              const payload = await response.json();
              const planText = payload && typeof payload.plan === 'string' ? payload.plan : '';
              if (!planText.trim()) {
                throw new Error('Server returned an empty plan. Check server logs for details.');
              }

              flushSync(() => {
                setPromptText(planText);
              });
            } catch (error) {
              console.error('Failed to create plan', error);
              if (restorePromptOnError) {
                flushSync(() => {
                  setPromptText(promptValue);
                });
              }
              window.alert('Failed to create plan. Check server logs for details.');
            } finally {
              setIsCreatingPlan(false);
            }
          },
          [isCreatingPlan, notifyAuthExpired],
        );

        const openIssuePlanModal = useCallback(
          (issue, repoInfo) => {
            if (!issue || !repoInfo) {
              return;
            }
            const { org, repo } = repoInfo;
            const issueNumberValue =
              typeof issue?.number === 'number'
                ? issue.number
                : Number.parseInt(issue?.number, 10);
            if (!org || !repo || Number.isNaN(issueNumberValue)) {
              return;
            }
            const promptValue = ISSUE_PLAN_PROMPT_TEMPLATE.replace(
              /<ISSUE_NUMBER>/g,
              String(issueNumberValue),
            );
            setSelectedRepo([org, repo]);
            setPromptText(promptValue);
            setPromptInputMode('edit');
            setShowPromptWorktreeModal(true);
            setOpenActionMenu(null);
            setIsMobileMenuOpen(false);
            const schedule =
              typeof queueMicrotask === 'function'
                ? queueMicrotask
                : (callback) => {
                    setTimeout(callback, 0);
                  };
            schedule(() => {
              void createPlanFromPrompt(promptValue, org, repo, {
                restorePromptOnError: true,
                rawPrompt: true,
                dangerousMode: true,
              });
            });
          },
          [
            setSelectedRepo,
            setPromptText,
            setPromptInputMode,
            setShowPromptWorktreeModal,
            setOpenActionMenu,
            setIsMobileMenuOpen,
            createPlanFromPrompt,
          ],
        );

        useEffect(() => {
          let cancelled = false;

          const parseCommand = (value, fallback) => {
            if (typeof value === 'string') {
              const trimmed = value.trim();
              if (trimmed) {
                return trimmed;
              }
            }
            return fallback;
          };

          const loadCommands = async () => {
            try {
              const response = await fetch('/api/commands', { credentials: 'include' });
              if (response.status === 401) {
                notifyAuthExpired();
                return;
              }
              if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
              }
              const body = await response.json();
              const commands = body && typeof body === 'object' ? body.commands : null;
              if (!commands || typeof commands !== 'object') {
                return;
              }
              const nextConfig = {
                codex: parseCommand(commands.codex, DEFAULT_COMMAND_CONFIG.codex),
                codexDangerous: parseCommand(
                  commands.codexDangerous,
                  DEFAULT_COMMAND_CONFIG.codexDangerous
                ),
                claude: parseCommand(commands.claude, DEFAULT_COMMAND_CONFIG.claude),
                claudeDangerous: parseCommand(
                  commands.claudeDangerous,
                  DEFAULT_COMMAND_CONFIG.claudeDangerous
                ),
                cursor: parseCommand(
                  commands.cursor ?? commands.ide,
                  DEFAULT_COMMAND_CONFIG.cursor
                ),
                vscode: parseCommand(commands.vscode, DEFAULT_COMMAND_CONFIG.vscode),
              };
              if (!cancelled) {
                setCommandConfig(nextConfig);
              }
            } catch (error) {
              console.error('Failed to load command configuration', error);
            }
          };

          loadCommands();

          return () => {
            cancelled = true;
          };
        }, [notifyAuthExpired]);

        const renderSpinner = (colorClass = '') =>
          h(
            'svg',
            {
              className: ['h-4 w-4 animate-spin', colorClass].filter(Boolean).join(' '),
              viewBox: '0 0 24 24',
              fill: 'none'
            },
            h('circle', {
              className: 'opacity-25',
              cx: '12',
              cy: '12',
              r: '10',
              stroke: 'currentColor',
              strokeWidth: '4'
            }),
            h('path', {
              className: 'opacity-75',
              fill: 'currentColor',
              d: 'M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z'
            })
          );

        const handleClosePlanModal = useCallback(() => {
          setPlanModal(createEmptyPlanModalState());
        }, []);

        const fetchPlanContent = useCallback(
          async (context, planId) => {
            if (!context || !planId) {
              return;
            }

            setPlanModal((current) => ({
              ...current,
              selectedPlanId: planId,
              content: '',
              contentLoading: true,
              contentError: null
            }));

            try {
              const params = new URLSearchParams({
                org: context.org,
                repo: context.repo,
                branch: context.branch,
                planId
              });
              const response = await fetch(`/api/plans/content?${params.toString()}`, {
                credentials: 'include'
              });
              if (response.status === 401) {
                notifyAuthExpired();
                setPlanModal(createEmptyPlanModalState());
                return;
              }
              if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
              }
              const body = await response.json();
              const data = body && typeof body === 'object' ? body.data : null;
              const content = data && typeof data.content === 'string' ? data.content : '';
              setPlanModal((current) => ({
                ...current,
                content,
                contentLoading: false,
                contentError: null
              }));
            } catch (error) {
              setPlanModal((current) => ({
                ...current,
                contentLoading: false,
                contentError: error?.message || 'Failed to load plan.'
              }));
            }
          },
          [notifyAuthExpired]
        );

        const openPlanHistory = useCallback(async () => {
          if (!activeWorktree) {
            return;
          }

          const context = {
            org: activeWorktree.org,
            repo: activeWorktree.repo,
            branch: activeWorktree.branch
          };

          setPlanModal({
            ...createEmptyPlanModalState(),
            open: true,
            loading: true,
            context
          });

          try {
            const params = new URLSearchParams(context);
            const response = await fetch(`/api/plans?${params.toString()}`, {
              credentials: 'include'
            });
            if (response.status === 401) {
              notifyAuthExpired();
              setPlanModal(createEmptyPlanModalState());
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const plans = Array.isArray(body?.data) ? body.data : [];
            setPlanModal((current) => ({
              ...current,
              loading: false,
              error: null,
              plans,
              context
            }));
            if (plans.length > 0) {
              await fetchPlanContent(context, plans[0].id);
            } else {
              setPlanModal((current) => ({
                ...current,
                selectedPlanId: null,
                content: ''
              }));
            }
          } catch (error) {
            setPlanModal((current) => ({
              ...current,
              loading: false,
              error: error?.message || 'Failed to load plans.'
            }));
          }
        }, [activeWorktree, fetchPlanContent, notifyAuthExpired]);

        const handleSelectPlan = useCallback(
          (planId) => {
            if (!planId || !planModal.context) {
              return;
            }
            fetchPlanContent(planModal.context, planId);
          },
          [fetchPlanContent, planModal.context]
        );

        const selectedPlan = useMemo(
          () => planModal.plans.find((plan) => plan.id === planModal.selectedPlanId) || null,
          [planModal.plans, planModal.selectedPlanId]
        );

        const planModalContentHtml = useMemo(
          () => (planModal.content ? renderMarkdown(planModal.content) : ''),
          [planModal.content]
        );

        const formatPlanTimestamp = (isoString) => {
          if (!isoString) {
            return 'Unknown date';
          }
          const date = new Date(isoString);
          if (Number.isNaN(date.getTime())) {
            return isoString;
          }
          return date.toLocaleString();
        };

        useEffect(() => {
          setGitDiffModal((current) => {
            if (!current.open) {
              return current;
            }
            return { open: false, loading: false, error: null, diff: '', file: null, view: 'split' };
          });
        }, [activeWorktree]);

        const resolveDefaultDiffView = useCallback(() => {
          if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
            return 'unified';
          }
          return 'split';
        }, []);

        const handleCloseGitDiff = useCallback(() => {
          setGitDiffModal({ open: false, loading: false, error: null, diff: '', file: null, view: resolveDefaultDiffView() });
        }, [resolveDefaultDiffView]);

        const handleOpenGitDiff = useCallback(
          ({ item }) => {
            if (!activeWorktree || !item || !item.path) {
              return;
            }

            const determineDiffMode = (target) => {
              if (target.kind === 'staged') {
                return 'staged';
              }
              if (target.kind === 'untracked') {
                return 'untracked';
              }
              if (target.kind === 'conflict') {
                return 'unstaged';
              }
              if (target.indexStatus && target.indexStatus !== ' ') {
                return 'staged';
              }
              return 'unstaged';
            };

            const diffMode = determineDiffMode(item);
            const nextFile = {
              path: item.path,
              previousPath: item.previousPath || null,
              kind: item.kind || null,
              status: item.status || '',
              mode: diffMode,
            };

            setGitDiffModal({ open: true, loading: true, error: null, diff: '', file: nextFile, view: resolveDefaultDiffView() });

            (async () => {
              try {
                const response = await fetch('/api/git/diff', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    org: activeWorktree.org,
                    repo: activeWorktree.repo,
                    branch: activeWorktree.branch,
                    path: item.path,
                    previousPath: item.previousPath || null,
                    mode: diffMode,
                    status: item.status || '',
                  }),
                });
                if (response.status === 401) {
                  notifyAuthExpired();
                  throw new Error('AUTH_REQUIRED');
                }
                if (!response.ok) {
                  throw new Error(`Request failed with status ${response.status}`);
                }
                const body = await response.json();
                const payload = body && typeof body === 'object' ? body.diff || null : null;
                setGitDiffModal((current) => ({
                  open: true,
                  loading: false,
                  error: null,
                  diff: payload && typeof payload.diff === 'string' ? payload.diff : '',
                  file: payload && typeof payload === 'object'
                    ? {
                        path: payload.path || nextFile.path,
                        previousPath: payload.previousPath ?? nextFile.previousPath,
                        kind: nextFile.kind,
                        status: nextFile.status,
                        mode: payload.mode || nextFile.mode,
                      }
                    : nextFile,
                  view: current.view || resolveDefaultDiffView(),
                }));
              } catch (error) {
                if (error && error.message === 'AUTH_REQUIRED') {
                  setGitDiffModal({ open: false, loading: false, error: null, diff: '', file: null, view: resolveDefaultDiffView() });
                  return;
                }
                setGitDiffModal((current) => ({
                  open: true,
                  loading: false,
                  error: error && error.message ? error.message : 'Failed to load diff',
                  diff: '',
                  file: current.file || nextFile,
                  view: current.view || resolveDefaultDiffView(),
                }));
              }
            })();
          },
          [activeWorktree, notifyAuthExpired, resolveDefaultDiffView],
        );

        const toggleDiffView = useCallback(() => {
          setGitDiffModal((current) => {
            if (!current.open) {
              return current;
            }
            const nextView = current.view === 'split' ? 'unified' : 'split';
            return { ...current, view: nextView };
          });
        }, []);

        const terminalContainerRef = useRef(null);
        const terminalRef = useRef(null);
        const fitAddonRef = useRef(null);
        const socketRef = useRef(null);
        const resizeObserverRef = useRef(null);
        const initSuppressedRef = useRef(false);
        const closedByProcessRef = useRef(false);
        const sessionMapRef = useRef(new Map());
        const sessionKeyByIdRef = useRef(new Map());
        const knownSessionsRef = useRef(new Set());
        const sessionMetadataRef = useRef(new Map());
        const [sessionMetadataSnapshot, setSessionMetadataSnapshot] = useState(() => new Map());
        const idleAcknowledgementsRef = useRef(new Map());
        const [idleAcknowledgementsSnapshot, setIdleAcknowledgementsSnapshot] = useState(() => new Map());
        const openTerminalForWorktreeRef = useRef(null);
        const getWorktreeKey = useCallback((org, repo, branch) => `${org}::${repo}::${branch}`, []);
        const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
        const removeTrackedSession = useCallback(
          (key) => {
            if (!key) {
              return;
            }
            knownSessionsRef.current.delete(key);
            if (sessionMetadataRef.current.has(key)) {
              const nextMetadata = new Map(sessionMetadataRef.current);
              nextMetadata.delete(key);
              sessionMetadataRef.current = nextMetadata;
              setSessionMetadataSnapshot(new Map(nextMetadata));
            }
            if (idleAcknowledgementsRef.current.has(key)) {
              const nextAcknowledgements = new Map(idleAcknowledgementsRef.current);
              nextAcknowledgements.delete(key);
              idleAcknowledgementsRef.current = nextAcknowledgements;
              setIdleAcknowledgementsSnapshot(new Map(nextAcknowledgements));
            }
          },
          [setIdleAcknowledgementsSnapshot, setSessionMetadataSnapshot],
        );

        const gitSidebarKey = activeWorktree
          ? getWorktreeKey(activeWorktree.org, activeWorktree.repo, activeWorktree.branch)
          : null;
        const gitSidebarEntry = gitSidebarKey ? gitSidebarState[gitSidebarKey] : null;
        const isGitSidebarOpen = Boolean(gitSidebarEntry?.open);
        const gitSidebarSnapshot = gitSidebarEntry?.snapshot || null;

        useEffect(() => {
          if (!activeWorktree) {
            return;
          }
          const key = getWorktreeKey(activeWorktree.org, activeWorktree.repo, activeWorktree.branch);
          setGitSidebarState(current => {
            if (current[key]) {
              return current;
            }
            return { ...current, [key]: { open: false, snapshot: null } };
          });
        }, [activeWorktree, getWorktreeKey]);

        const handleGitStatusUpdate = useCallback(
          (snapshot) => {
            if (!gitSidebarKey) {
              return;
            }
            setGitSidebarState((current) => {
              const previous = current[gitSidebarKey] || { open: false, snapshot: null };
              if (previous.snapshot && snapshot && previous.snapshot.fetchedAt === snapshot.fetchedAt) {
                return current;
              }
              return {
                ...current,
                [gitSidebarKey]: { ...previous, snapshot },
              };
            });
          },
          [gitSidebarKey],
        );

        const toggleGitSidebar = useCallback(() => {
          if (!gitSidebarKey) {
            return;
          }
          let nextOpen = false;
          setGitSidebarState((current) => {
            const previous = current[gitSidebarKey] || { open: false, snapshot: null };
            nextOpen = !previous.open;
            return {
              ...current,
              [gitSidebarKey]: { ...previous, open: nextOpen },
            };
          });
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('terminal-worktree:git-sidebar-toggle', {
                detail: {
                  worktree: gitSidebarKey,
                  open: nextOpen,
                  timestamp: Date.now()
                }
              })
            );
          }
        }, [gitSidebarKey]);

        const closeGitSidebar = useCallback(() => {
          if (!gitSidebarKey) {
            return;
          }
          setGitSidebarState((current) => {
            const previous = current[gitSidebarKey] || { open: false, snapshot: null };
            if (!previous.open) {
              return current;
            }
            return {
              ...current,
              [gitSidebarKey]: { ...previous, open: false },
            };
          });
        }, [gitSidebarKey]);

        const normaliseRepositoryPayload = useCallback((payload) => {
          if (!payload || typeof payload !== 'object') {
            return {};
          }
          return Object.fromEntries(
            Object.entries(payload).map(([org, repos]) => {
              const repoMap = Object.entries(repos || {}).map(([repo, value]) => {
                const repoInfo = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
                const branchesSource = Array.isArray(repoInfo.branches) ? repoInfo.branches : Array.isArray(value) ? value : [];
                const branches = branchesSource
                  .filter((branch) => typeof branch === 'string' && branch.trim().length > 0)
                  .map((branch) => branch.trim());
                const initCommand =
                  typeof repoInfo.initCommand === 'string' ? repoInfo.initCommand.trim() : '';
                return [repo, { branches, initCommand }];
              });
              return [org, Object.fromEntries(repoMap)];
            }),
          );
        }, []);

        const applyDataUpdate = useCallback((payload) => {
          const normalised = normaliseRepositoryPayload(payload);
          setData(normalised);
          setActiveWorktree((current) => {
            if (!current) {
              return current;
            }
            const repoInfo = normalised?.[current.org]?.[current.repo] || {};
            const branches = Array.isArray(repoInfo.branches) ? repoInfo.branches : [];
            if (branches.includes(current.branch) && current.branch !== 'main') {
              return current;
            }
            return null;
          });
          setActiveRepoDashboard((current) => {
            if (!current) {
              return current;
            }
            const repoInfo = normalised?.[current.org]?.[current.repo] || {};
            const branches = Array.isArray(repoInfo.branches) ? repoInfo.branches : [];
            if (branches.includes('main')) {
              return current;
            }
            return null;
          });
          sessionMapRef.current.forEach((session, key) => {
            const [orgKey, repoKey, branchKey] = key.split('::');
            const repoInfo = normalised?.[orgKey]?.[repoKey] || {};
            const branches = Array.isArray(repoInfo.branches) ? repoInfo.branches : [];
            if (!branches.includes(branchKey)) {
              sessionMapRef.current.delete(key);
              sessionKeyByIdRef.current.delete(session);
              removeTrackedSession(key);
            }
          });
        }, [normaliseRepositoryPayload, removeTrackedSession]);

        const syncKnownSessions = useCallback((sessions) => {
          const aggregated = new Map();
          if (Array.isArray(sessions)) {
            sessions.forEach((item) => {
              if (!item || typeof item !== 'object') {
                return;
              }
              const org = typeof item.org === 'string' ? item.org : null;
              const repo = typeof item.repo === 'string' ? item.repo : null;
              const branch = typeof item.branch === 'string' ? item.branch : null;
              if (!org || !repo || !branch) {
                return;
              }
              const key = `${org}::${repo}::${branch}`;
              const idle = Boolean(item.idle);
              const lastActivityAtMs = parseActivityTimestamp(item.lastActivityAt);
              const existing = aggregated.get(key);
              if (!existing) {
                aggregated.set(key, {
                  org,
                  repo,
                  branch,
                  idle,
                  lastActivityAtMs,
                });
                return;
              }
              existing.idle = existing.idle && idle;
              if (
                isFiniteNumber(lastActivityAtMs) &&
                (!isFiniteNumber(existing.lastActivityAtMs) || lastActivityAtMs > existing.lastActivityAtMs)
              ) {
                existing.lastActivityAtMs = lastActivityAtMs;
              }
            });
          }

          const nextKnownSessions = new Set();
          const nextMetadata = new Map();
          aggregated.forEach((value, key) => {
            const lastActivityAtMs = isFiniteNumber(value.lastActivityAtMs) ? value.lastActivityAtMs : null;
            nextKnownSessions.add(key);
            nextMetadata.set(key, {
              org: value.org,
              repo: value.repo,
              branch: value.branch,
              idle: value.idle,
              lastActivityAtMs,
              lastActivityAt: isFiniteNumber(lastActivityAtMs) ? new Date(lastActivityAtMs).toISOString() : null,
            });
          });

          knownSessionsRef.current = nextKnownSessions;
          sessionMetadataRef.current = nextMetadata;
          setSessionMetadataSnapshot(new Map(nextMetadata));

          const nextAcknowledgements = new Map();
          idleAcknowledgementsRef.current.forEach((value, key) => {
            const metadata = nextMetadata.get(key);
            if (!metadata) {
              return;
            }
            const entry = normaliseIdleAcknowledgementEntry(value);
            if (!isIdleAcknowledgementCurrent(metadata, entry)) {
              return;
            }
            const metadataLastActivityMs = getMetadataLastActivityMs(metadata);
            if (isFiniteNumber(metadataLastActivityMs)) {
              entry.lastSeenActivityMs = metadataLastActivityMs;
            }
            nextAcknowledgements.set(key, entry);
          });

          idleAcknowledgementsRef.current = nextAcknowledgements;
          setIdleAcknowledgementsSnapshot(new Map(nextAcknowledgements));
        }, []);

        const processPendingTask = useCallback(
          (task) => {
            if (!task || typeof task !== 'object' || !task.id) {
              return;
            }
            const pending = pendingLaunchesRef.current.get(task.id);
            if (!pending) {
              return;
            }
            if (task.removed) {
              pendingLaunchesRef.current.delete(task.id);
              return;
            }
            if (task.status === 'failed') {
              pendingLaunchesRef.current.delete(task.id);
              const message =
                (task.error && typeof task.error.message === 'string' && task.error.message) ||
                'Worktree creation failed. Check server logs for details.';
              console.error('Worktree task failed', task.error || message);
              window.alert(`Worktree creation failed: ${message}`);
              return;
            }
            if (task.status !== 'succeeded') {
              return;
            }

            pendingLaunchesRef.current.delete(task.id);

            const openTerminal = openTerminalForWorktreeRef.current;
            if (typeof openTerminal !== 'function') {
              return;
            }

            const branchCandidates = [
              task?.result && typeof task.result.branch === 'string' ? task.result.branch.trim() : '',
              task?.metadata && typeof task.metadata.branch === 'string' ? task.metadata.branch.trim() : '',
              pending.requestedBranch ? pending.requestedBranch.trim() : '',
            ];
            const resolvedBranch = branchCandidates.find((value) => value);
            if (!resolvedBranch) {
              window.alert('Worktree creation completed but branch name could not be determined.');
              return;
            }

            const worktree = {
              org: pending.org,
              repo: pending.repo,
              branch: resolvedBranch,
            };

            const previousActive = activeWorktreeRef.current;

            setActiveRepoDashboard(null);
            clearDashboardPolling();
            setDashboardError(null);
            setIsDashboardLoading(false);
            setActiveWorktree(worktree);

            const worktreeKey = getWorktreeKey(worktree.org, worktree.repo, worktree.branch);
            const hasKnownSession =
              sessionMapRef.current.has(worktreeKey) || knownSessionsRef.current.has(worktreeKey);

            const resolvedCommand =
              pending.kind === 'prompt'
                ? pending.command
                : hasKnownSession
                ? null
                : getCommandForLaunch(pending.launchOption, pending.dangerousMode);

            void (async () => {
              try {
                if (pending.kind === 'prompt') {
                  await openTerminal(worktree, {
                    command: pending.command,
                    prompt: pending.promptValue,
                  });
                } else if (resolvedCommand) {
                  await openTerminal(worktree, { command: resolvedCommand });
                } else {
                  await openTerminal(worktree);
                }
                setPendingWorktreeAction(null);
              } catch (error) {
                if (error && error.message === 'AUTH_REQUIRED') {
                  setActiveWorktree(previousActive || null);
                  return;
                }
                if (pending.kind === 'prompt') {
                  console.error('Failed to launch prompt workspace', error);
                  window.alert('Failed to launch the selected agent. Check server logs for details.');
                  setPendingWorktreeAction(worktree);
                } else if (hasKnownSession) {
                  window.alert('Failed to reconnect to the existing session.');
                } else {
                  console.error('Failed to launch the selected option', error);
                  window.alert('Failed to launch the selected option. Check server logs for details.');
                  setPendingWorktreeAction(worktree);
                }
                setActiveWorktree(previousActive || null);
                return;
              }

              if (pending.kind === 'prompt') {
                setPromptText('');
                setPromptAgent('codex');
                setPromptDangerousMode(false);
                setPromptInputMode('edit');
                setShowPromptWorktreeModal(false);
              } else {
                setBranchName('');
                setWorktreeLaunchOption('terminal');
                setLaunchDangerousMode(false);
                setShowWorktreeModal(false);
              }
              setIsMobileMenuOpen(false);
            })();
          }, [
            activeWorktreeRef,
            clearDashboardPolling,
            getCommandForLaunch,
            getWorktreeKey,
            knownSessionsRef,
            openTerminalForWorktreeRef,
            sessionMapRef,
            setActiveRepoDashboard,
            setDashboardError,
            setIsDashboardLoading,
          ]);

        const refreshRepositories = useCallback(async () => {
          try {
            const response = await fetch('/api/repos', { credentials: 'include' });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const payload = body && typeof body === 'object' && body.data ? body.data : {};
            applyDataUpdate(payload);
          } catch (error) {
            console.error('Failed to load repositories', error);
          }
        }, [applyDataUpdate, notifyAuthExpired]);

        useEffect(() => {
          refreshRepositories();
        }, [refreshRepositories]);

        const loadSessions = useCallback(async () => {
          try {
            const response = await fetch('/api/sessions', { credentials: 'include' });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const sessions = Array.isArray(body.sessions) ? body.sessions : [];
            syncKnownSessions(sessions);
          } catch (error) {
            syncKnownSessions([]);
          }
        }, [notifyAuthExpired, syncKnownSessions]);

        const loadTasks = useCallback(async () => {
          try {
            const response = await fetch('/api/tasks', { credentials: 'include' });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const taskList = Array.isArray(body?.tasks) ? body.tasks : [];
            const map = new Map();
            taskList.forEach((task) => {
              if (task && task.id) {
                map.set(task.id, task);
              }
            });
            taskMapRef.current = map;
            const sorted = Array.from(map.values()).sort((a, b) => {
              const timeA = Date.parse(a?.updatedAt || a?.createdAt || '') || 0;
              const timeB = Date.parse(b?.updatedAt || b?.createdAt || '') || 0;
              return timeB - timeA;
            });
            setTasks(sorted);
            taskList.forEach((task) => processPendingTask(task));
          } catch (error) {
            console.error('Failed to load tasks', error);
          }
        }, [notifyAuthExpired, processPendingTask]);

        useEffect(() => {
          loadTasks();
        }, [loadTasks]);

        // Event stream effect moved below to include task updates.

        useEffect(() => {
          if (!isRealtimeConnected) {
            refreshRepositories();
            loadSessions();
            loadTasks();
          }
        }, [isRealtimeConnected, loadSessions, loadTasks, refreshRepositories]);

        useEffect(() => {
          if (isRealtimeConnected) {
            return () => {};
          }

          if (!REPOSITORY_POLL_INTERVAL_MS || Number.isNaN(REPOSITORY_POLL_INTERVAL_MS)) {
            return () => {};
          }

          let timerId = null;
          let cancelled = false;
          let inFlight = false;

          const isDocumentVisible = () =>
            typeof document === 'undefined' || document.visibilityState !== 'hidden';

          const tick = () => {
            if (cancelled || inFlight || !isDocumentVisible()) {
              return;
            }
            inFlight = true;
            refreshRepositories()
              .catch(() => {})
              .finally(() => {
                inFlight = false;
              });
          };

          timerId = window.setInterval(tick, REPOSITORY_POLL_INTERVAL_MS);

          const handleVisibilityChange = () => {
            if (isDocumentVisible()) {
              tick();
            }
          };

          if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
          }

          return () => {
            cancelled = true;
            if (timerId !== null) {
              window.clearInterval(timerId);
            }
            if (typeof document !== 'undefined') {
              document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
          };
        }, [isRealtimeConnected, refreshRepositories]);

        const fetchRepositoryDashboard = useCallback(
          async (org, repo, { showLoading = true } = {}) => {
            if (!org || !repo) {
              return null;
            }

            if (showLoading) {
              setIsDashboardLoading(true);
            }

            if (dashboardPollingRef.current.controller) {
              dashboardPollingRef.current.controller.abort();
            }

            const controller = new AbortController();
            dashboardPollingRef.current.controller = controller;

            try {
              const response = await fetch(
                `/api/repos/dashboard?org=${encodeURIComponent(org)}&repo=${encodeURIComponent(repo)}`,
                { credentials: 'include', signal: controller.signal },
              );

              if (response.status === 401) {
                notifyAuthExpired();
                throw new Error('AUTH_REQUIRED');
              }

              if (!response.ok) {
                let message = `Request failed with status ${response.status}`;
                try {
                  const errorBody = await response.json();
                  if (errorBody && typeof errorBody === 'object' && typeof errorBody.error === 'string') {
                    message = errorBody.error;
                  }
                } catch {
                  // ignore JSON parse failures
                }
                throw new Error(message);
              }

              const body = await response.json();
              const payload = body && typeof body === 'object' && body.data ? body.data : null;

              if (payload) {
                const cacheKey = `${org}::${repo}`;
                dashboardCacheRef.current.set(cacheKey, payload);
                setDashboardData(payload);
                setDashboardError(null);
              } else {
                setDashboardError('Unexpected response from server');
              }

              return payload;
            } catch (error) {
              if (controller.signal.aborted) {
                return null;
              }
              if (error && error.message === 'AUTH_REQUIRED') {
                return null;
              }
              setDashboardError(error?.message || 'Failed to load dashboard metrics');
              return null;
            } finally {
              if (dashboardPollingRef.current.controller === controller) {
                dashboardPollingRef.current.controller = null;
              }
              if (showLoading) {
                setIsDashboardLoading(false);
              }
            }
          },
          [notifyAuthExpired],
        );

        useEffect(() => {
          loadSessions();
        }, [loadSessions]);

        useEffect(() => {
          if (isRealtimeConnected) {
            return () => {};
          }
          const id = window.setInterval(() => {
            loadSessions();
          }, SESSION_POLL_INTERVAL_MS);
          return () => window.clearInterval(id);
        }, [isRealtimeConnected, loadSessions]);

        useEffect(() => {
          if (!activeRepoDashboard) {
            clearDashboardPolling();
            setIsDashboardLoading(false);
            setDashboardError(null);
            setDashboardData(null);
            return () => {};
          }

          const { org, repo } = activeRepoDashboard;
          const cacheKey = `${org}::${repo}`;
          const cached = dashboardCacheRef.current.get(cacheKey);

          if (cached) {
            setDashboardData(cached);
            setDashboardError(null);
          }

          let visibilityListenerAttached = false;

          const startPolling = () => {
            if (!REPOSITORY_DASHBOARD_POLL_INTERVAL_MS || Number.isNaN(REPOSITORY_DASHBOARD_POLL_INTERVAL_MS)) {
              return;
            }
            if (typeof window === 'undefined') {
              return;
            }
            if (dashboardPollingRef.current.timerId !== null) {
              window.clearInterval(dashboardPollingRef.current.timerId);
            }
            const timerId = window.setInterval(() => {
              if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                return;
              }
              fetchRepositoryDashboard(org, repo, { showLoading: false });
            }, REPOSITORY_DASHBOARD_POLL_INTERVAL_MS);
            dashboardPollingRef.current.timerId = timerId;
          };

          clearDashboardPolling();
          fetchRepositoryDashboard(org, repo, { showLoading: !cached });
          startPolling();

          const handleVisibilityChange = () => {
            if (typeof document === 'undefined') {
              return;
            }
            if (document.visibilityState === 'hidden') {
              clearDashboardPolling();
              if (dashboardPollingRef.current.controller) {
                dashboardPollingRef.current.controller.abort();
              }
            } else {
              fetchRepositoryDashboard(org, repo, { showLoading: false });
              startPolling();
            }
          };

          if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', handleVisibilityChange);
            visibilityListenerAttached = true;
          }

          return () => {
            if (visibilityListenerAttached && typeof document !== 'undefined') {
              document.removeEventListener('visibilitychange', handleVisibilityChange);
            }
            clearDashboardPolling();
          };
        }, [
          activeRepoDashboard,
          clearDashboardPolling,
          fetchRepositoryDashboard,
        ]);

        const disposeSocket = useCallback(() => {
          if (socketRef.current) {
            try {
              socketRef.current.close();
            } catch (err) {
              // ignore
            }
            socketRef.current = null;
          }
        }, []);

        const disposeTerminal = useCallback(() => {
          if (terminalRef.current) {
            try {
              terminalRef.current.dispose();
            } catch (err) {
              // ignore
            }
            terminalRef.current = null;
          }
          fitAddonRef.current = null;
          if (terminalContainerRef.current) {
            terminalContainerRef.current.innerHTML = '';
          }
        }, []);

        useEffect(
          () => () => {
            disposeSocket();
            disposeTerminal();
            if (resizeObserverRef.current) {
              resizeObserverRef.current.disconnect();
            }
          },
          [disposeSocket, disposeTerminal]
        );

        const sendResize = useCallback(() => {
          if (!terminalRef.current || !fitAddonRef.current) {
            return;
          }
          fitAddonRef.current.fit();
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            const { cols, rows } = terminalRef.current;
            socketRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
          }
        }, []);

        useEffect(() => {
          requestAnimationFrame(() => {
            sendResize();
          });
          const timeout = setTimeout(() => {
            sendResize();
          }, 200);
          return () => clearTimeout(timeout);
        }, [width, isMobileMenuOpen, sessionId, isGitSidebarOpen, sendResize]);

        useEffect(() => {
          const handler = () => {
            sendResize();
            requestAnimationFrame(() => sendResize());
            setTimeout(() => sendResize(), 200);
          };
          window.addEventListener('resize', handler, { passive: true });
          window.addEventListener('orientationchange', handler, { passive: true });
          return () => {
            window.removeEventListener('resize', handler);
            window.removeEventListener('orientationchange', handler);
          };
        }, [removeTrackedSession, sendResize]);

        useEffect(() => {
          if (!terminalContainerRef.current) {
            return;
          }
          const observer = new ResizeObserver(() => {
            sendResize();
          });
          observer.observe(terminalContainerRef.current);
          resizeObserverRef.current = observer;
          return () => observer.disconnect();
        }, [sendResize]);

        const setupTerminal = useCallback(initialLog => {
          disposeTerminal();
          if (!terminalContainerRef.current) {
            return;
          }
          const term = new Terminal({
            allowTransparency: true,
            convertEol: true,
            cursorBlink: true,
            fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
            fontSize: 13,
            theme: {
              background: '#111111',
              foreground: '#f4f4f5',
              cursor: '#f4f4f5'
            },
            scrollback: 8000
          });
          const fitAddon = new FitAddon();
          term.loadAddon(fitAddon);
          terminalRef.current = term;
          fitAddonRef.current = fitAddon;
          term.open(terminalContainerRef.current);
          term.focus();
          if (initialLog) {
            term.write(initialLog);
          }
          term.onData(data => {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({ type: 'input', data }));
            }
          });
          term.onResize(({ cols, rows }) => {
            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
              socketRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
            }
          });
          requestAnimationFrame(() => {
            sendResize();
            term.focus();
          });
        }, [disposeTerminal, sendResize]);

        useEffect(() => {
          const container = terminalContainerRef.current;
          if (!container) {
            return;
          }
          let touchStartY = null;

          const handleWheel = (event) => {
            if (!terminalRef.current) {
              return;
            }
            if (event.deltaY === 0) {
              return;
            }
            event.preventDefault();
            const multiplier = event.deltaMode === 0 ? 1 / 40 : 1; // pixel or line
            const amount = Math.round(event.deltaY * multiplier);
            if (amount !== 0) {
              terminalRef.current.scrollLines(amount);
            }
          };

          const handleTouchStart = (event) => {
            if (!terminalRef.current) {
              return;
            }
            if (event.touches.length === 1) {
              touchStartY = event.touches[0].clientY;
            }
          };

          const handleTouchMove = (event) => {
            if (!terminalRef.current) {
              return;
            }
            if (event.touches.length === 1 && touchStartY !== null) {
              const delta = touchStartY - event.touches[0].clientY;
              if (Math.abs(delta) > 2) {
                event.preventDefault();
                terminalRef.current.scrollLines(Math.round(delta / 30));
                touchStartY = event.touches[0].clientY;
              }
            }
          };

          const handleTouchEnd = () => {
            touchStartY = null;
          };

          container.addEventListener('wheel', handleWheel, { passive: false });
          container.addEventListener('touchstart', handleTouchStart, { passive: false });
          container.addEventListener('touchmove', handleTouchMove, { passive: false });
          container.addEventListener('touchend', handleTouchEnd);
          container.addEventListener('touchcancel', handleTouchEnd);

          return () => {
            container.removeEventListener('wheel', handleWheel);
            container.removeEventListener('touchstart', handleTouchStart);
            container.removeEventListener('touchmove', handleTouchMove);
            container.removeEventListener('touchend', handleTouchEnd);
            container.removeEventListener('touchcancel', handleTouchEnd);
          };
        }, [sessionId]);

        const connectSocket = useCallback(newSessionId => {
          if (!newSessionId) {
            return;
          }
          const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
          const socketUrl = `${protocol}://${window.location.host}/api/terminal/socket?sessionId=${encodeURIComponent(
            newSessionId
          )}`;
          const socket = new WebSocket(socketUrl);
          socketRef.current = socket;

          socket.addEventListener('open', () => {
            setTerminalStatus('connected');
            sendResize();
          });

          socket.addEventListener('message', event => {
            let payload;
            try {
              payload = JSON.parse(event.data);
            } catch (err) {
              return;
            }
            if (payload.type === 'output') {
              if (payload.reset && terminalRef.current) {
                terminalRef.current.reset();
                sendResize();
              }
              if (terminalRef.current && payload.chunk) {
                terminalRef.current.write(payload.chunk);
              }
            } else if (payload.type === 'exit') {
              closedByProcessRef.current = true;
              setTerminalStatus('closed');
              const key = sessionKeyByIdRef.current.get(newSessionId);
              if (key) {
                sessionMapRef.current.delete(key);
                sessionKeyByIdRef.current.delete(newSessionId);
                removeTrackedSession(key);
              }
            } else if (payload.type === 'init') {
              if (!initSuppressedRef.current && payload.log && terminalRef.current) {
                terminalRef.current.write(payload.log);
              }
              initSuppressedRef.current = false;
              if (payload.closed) {
                closedByProcessRef.current = true;
                setTerminalStatus('closed');
              }
            } else if (payload.type === 'error') {
              console.error(payload.message || 'Terminal connection error');
              setTerminalStatus('error');
              const key = sessionKeyByIdRef.current.get(newSessionId);
              if (key) {
                sessionMapRef.current.delete(key);
                sessionKeyByIdRef.current.delete(newSessionId);
                removeTrackedSession(key);
              }
            }
          });

          socket.addEventListener('close', () => {
            if (closedByProcessRef.current) {
              setTerminalStatus('closed');
            } else {
              setTerminalStatus('disconnected');
            }
          });

          socket.addEventListener('error', () => {
            setTerminalStatus('error');
          });
        }, [sendResize]);

        const openTerminalForWorktree = useCallback(async (worktree, options = {}) => {
          const { command, prompt } = options;
          disposeSocket();
          if (!worktree) {
            disposeTerminal();
            setSessionId(null);
            setTerminalStatus('disconnected');
            return;
          }
          setTerminalStatus('connecting');
          closedByProcessRef.current = false;
          initSuppressedRef.current = true;
          try {
            const payload = { ...worktree };
            if (command) {
              payload.command = command;
            }
            if (prompt !== undefined) {
              payload.prompt = prompt;
            }
            const response = await fetch('/api/terminal/open', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify(payload)
            });
            if (response.status === 401) {
              notifyAuthExpired();
              throw new Error('AUTH_REQUIRED');
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const session = body && body.sessionId ? body.sessionId : null;
            const created = body && typeof body.created === 'boolean' ? body.created : false;
            if (!session) {
              throw new Error('Invalid session response');
            }
            setSessionId(session);
            const worktreeKey = getWorktreeKey(worktree.org, worktree.repo, worktree.branch);
            const previousSession = sessionMapRef.current.get(worktreeKey);
            if (previousSession && previousSession !== session) {
              sessionKeyByIdRef.current.delete(previousSession);
            }
            sessionMapRef.current.set(worktreeKey, session);
            sessionKeyByIdRef.current.set(session, worktreeKey);
            knownSessionsRef.current.add(worktreeKey);
            const initialLog = body && typeof body.log === 'string' ? body.log : '';
            setupTerminal(initialLog);
            connectSocket(session);
            setIsMobileMenuOpen(false);
            return { sessionId: session, created };
          } catch (error) {
            console.error('Failed to open terminal session', error);
            disposeTerminal();
            setSessionId(null);
            setTerminalStatus('error');
            throw error;
          }
        }, [connectSocket, disposeSocket, disposeTerminal, setupTerminal, getWorktreeKey, notifyAuthExpired]);

        openTerminalForWorktreeRef.current = openTerminalForWorktree;

        const applyTaskUpdate = useCallback(
          (payload) => {
            if (!payload || typeof payload !== 'object') {
              return;
            }

            const map = new Map(taskMapRef.current);

            const upsertTask = (task) => {
              if (!task || typeof task !== 'object' || !task.id) {
                return;
              }
              if (task.removed) {
                map.delete(task.id);
                pendingLaunchesRef.current.delete(task.id);
                return;
              }
              map.set(task.id, task);
              processPendingTask(task);
            };

            if (Array.isArray(payload.tasks)) {
              payload.tasks.forEach((task) => {
                upsertTask(task);
              });
            } else if (payload.task) {
              upsertTask(payload.task);
            } else {
              return;
            }

            taskMapRef.current = map;
            const sorted = Array.from(map.values()).sort((a, b) => {
              const timeA = Date.parse(a?.updatedAt || a?.createdAt || '') || 0;
              const timeB = Date.parse(b?.updatedAt || b?.createdAt || '') || 0;
              return timeB - timeA;
            });
            setTasks(sorted);
          },
          [processPendingTask],
        );

        useEffect(() => {
          if (!Array.isArray(tasks) || tasks.length === 0) {
            setIsTaskMenuOpen(false);
          }
        }, [tasks]);

        useEffect(() => {
          const stop = createEventStream({
            onRepos: (payload) => {
              const reposData = payload && typeof payload === 'object' ? payload.data : null;
              if (reposData) {
                applyDataUpdate(reposData);
              }
            },
            onSessions: (payload) => {
              const sessions = payload && typeof payload === 'object' ? payload.sessions : null;
              if (sessions) {
                syncKnownSessions(sessions);
              }
            },
            onTasks: (payload) => {
              applyTaskUpdate(payload);
            },
            onConnect: () => {
              setIsRealtimeConnected(true);
            },
            onDisconnect: () => {
              setIsRealtimeConnected(false);
            },
          });

          return stop;
        }, [applyDataUpdate, applyTaskUpdate, syncKnownSessions]);

        const handleAddRepo = async () => {
          if (isAddingRepo) {
            return;
          }
          const trimmed = repoUrl.trim();
          if (!trimmed) {
            window.alert('Please enter a repository URL.');
            return;
          }
          const initCommandPayload = repoInitCommand.trim();
          setIsAddingRepo(true);
          try {
            const response = await fetch('/api/repos', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ url: trimmed, initCommand: initCommandPayload })
            });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const payload = body && typeof body === 'object' && body.data ? body.data : {};
            applyDataUpdate(payload);
            const normalisedPayload = normaliseRepositoryPayload(payload);
            const info = body && body.repo ? body.repo : null;
            if (info && info.org && info.repo) {
              const repoInfo = normalisedPayload?.[info.org]?.[info.repo] || {};
              const branches = Array.isArray(repoInfo.branches) ? repoInfo.branches : [];
              const firstNonMain = branches.find(branch => branch !== 'main');
              if (firstNonMain) {
                const key = getWorktreeKey(info.org, info.repo, firstNonMain);
                if (sessionMapRef.current.has(key) || knownSessionsRef.current.has(key)) {
                  setActiveWorktree({ org: info.org, repo: info.repo, branch: firstNonMain });
                  try {
                    await openTerminalForWorktree({ org: info.org, repo: info.repo, branch: firstNonMain });
                    setPendingWorktreeAction(null);
                  } catch {
                    window.alert('Failed to reconnect to the existing session.');
                  }
                } else {
                  setPendingWorktreeAction({ org: info.org, repo: info.repo, branch: firstNonMain });
                }
                setIsMobileMenuOpen(false);
              } else {
                setActiveWorktree(null);
              }
            }
            setRepoUrl('');
            setRepoInitCommand('');
            setShowAddRepoModal(false);
          } catch (error) {
            console.error('Failed to clone repository', error);
            window.alert('Failed to clone repository. Check server logs for details.');
          } finally {
            setIsAddingRepo(false);
          }
        };

        const closeEditInitCommandModal = useCallback(() => {
          setEditInitCommandModal({
            open: false,
            org: null,
            repo: null,
            value: '',
            error: null,
            saving: false,
          });
        }, []);

        const requestRepoDeletionFromSettings = useCallback(() => {
          if (editInitCommandModal.saving || isDeletingRepo) {
            return;
          }
          const { org, repo, value } = editInitCommandModal;
          if (!org || !repo) {
            return;
          }
          setConfirmDeleteRepo({
            org,
            repo,
            reopenSettings: true,
            initCommandDraft: value,
          });
          closeEditInitCommandModal();
        }, [closeEditInitCommandModal, editInitCommandModal, isDeletingRepo]);

        const handleSaveInitCommand = useCallback(async () => {
          const state = editInitCommandModal;
          if (!state.open || state.saving || !state.org || !state.repo) {
            return;
          }
          setEditInitCommandModal((current) => ({ ...current, saving: true, error: null }));
          try {
            const response = await fetch('/api/repos/init-command', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                org: state.org,
                repo: state.repo,
                initCommand: state.value,
              }),
            });
            if (response.status === 401) {
              notifyAuthExpired();
              setEditInitCommandModal((current) => ({ ...current, saving: false }));
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const payload = body && typeof body === 'object' && body.data ? body.data : {};
            applyDataUpdate(payload);
            closeEditInitCommandModal();
          } catch (error) {
            setEditInitCommandModal((current) => ({
              ...current,
              saving: false,
              error: error?.message || 'Failed to update init command.',
            }));
          }
        }, [applyDataUpdate, closeEditInitCommandModal, editInitCommandModal, notifyAuthExpired]);

        const handleConfirmDeleteRepo = async () => {
          if (isDeletingRepo || !confirmDeleteRepo) {
            return;
          }
          const { org, repo } = confirmDeleteRepo;
          setIsDeletingRepo(true);
          try {
            const response = await fetch('/api/repos', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ org, repo })
            });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const payload = body && typeof body === 'object' && body.data ? body.data : {};
            applyDataUpdate(payload);
            sessionMapRef.current.forEach((session, key) => {
              const [orgKey, repoKey] = key.split('::');
              if (orgKey === org && repoKey === repo) {
                sessionMapRef.current.delete(key);
                sessionKeyByIdRef.current.delete(session);
                removeTrackedSession(key);
              }
            });
            setActiveWorktree(current => {
              if (current && current.org === org && current.repo === repo) {
                return null;
              }
              return current;
            });
            if (
              pendingWorktreeAction &&
              pendingWorktreeAction.org === org &&
              pendingWorktreeAction.repo === repo
            ) {
              setPendingWorktreeAction(null);
            }
            if (
              activeWorktree &&
              activeWorktree.org === org &&
              activeWorktree.repo === repo
            ) {
              disposeSocket();
              disposeTerminal();
              setSessionId(null);
              setTerminalStatus('disconnected');
            }
            dashboardCacheRef.current.delete(`${org}::${repo}`);
            if (
              activeRepoDashboard &&
              activeRepoDashboard.org === org &&
              activeRepoDashboard.repo === repo
            ) {
              clearDashboardPolling();
              setActiveRepoDashboard(null);
              setDashboardData(null);
              setDashboardError(null);
              setIsDashboardLoading(false);
            }
            setConfirmDeleteRepo(null);
          } catch (error) {
            console.error('Failed to delete repository', error);
            window.alert('Failed to delete repository. Check server logs for details.');
          } finally {
            setIsDeletingRepo(false);
          }
        };

        const handleCreateWorktree = async () => {
          if (isCreatingWorktree) {
            return;
          }
          if (!selectedRepo) return;
          const trimmedBranch = branchName.trim();
          if (!trimmedBranch) return;
          const [org, repo] = selectedRepo;
          setIsCreatingWorktree(true);
          try {
            const response = await fetch('/api/worktrees', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ org, repo, branch: trimmedBranch })
            });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const taskId = body && typeof body.taskId === 'string' ? body.taskId : '';
            if (!taskId) {
              throw new Error('Server did not return a task identifier.');
            }
            pendingLaunchesRef.current.set(taskId, {
              kind: 'manual',
              org,
              repo,
              requestedBranch: trimmedBranch,
              launchOption: worktreeLaunchOption,
              dangerousMode: launchDangerousMode,
            });
            setShowWorktreeModal(false);
            setIsMobileMenuOpen(false);
          } catch (error) {
            console.error('Failed to create worktree', error);
            window.alert('Failed to create worktree. Check server logs for details.');
          } finally {
            setIsCreatingWorktree(false);
          }
        };

        const handleCreatePlan = () => {
          if (!selectedRepo) {
            window.alert('Select a repository before creating a plan.');
            return;
          }
          const [org, repo] = selectedRepo;
          void createPlanFromPrompt(promptText, org, repo);
        };

        const handleCreateWorktreeFromPrompt = async () => {
          if (isCreatingPromptWorktree) {
            return;
          }
          if (!selectedRepo) {
            return;
          }
          if (!promptText.trim()) {
            window.alert('Please enter a prompt.');
            return;
          }

          const command = getCommandForLaunch(promptAgent, promptDangerousMode);
          if (!command) {
            window.alert('Selected agent command is not configured.');
            return;
          }

          const [org, repo] = selectedRepo;
          const promptValue = promptText;
          setIsCreatingPromptWorktree(true);
          try {
            const response = await fetch('/api/worktrees', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ org, repo, prompt: promptValue })
            });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const taskId = body && typeof body.taskId === 'string' ? body.taskId : '';
            if (!taskId) {
              throw new Error('Server did not return a task identifier.');
            }
            pendingLaunchesRef.current.set(taskId, {
              kind: 'prompt',
              org,
              repo,
              requestedBranch: '',
              command,
              promptValue,
              launchOption: promptAgent,
              dangerousMode: promptDangerousMode,
            });
            setShowPromptWorktreeModal(false);
            setIsMobileMenuOpen(false);
          } catch (error) {
            console.error('Failed to create worktree from prompt', error);
            window.alert('Failed to create worktree. Check server logs for details.');
          } finally {
            setIsCreatingPromptWorktree(false);
          }
        };

        const handleConfirmDelete = async () => {
          if (isDeletingWorktree || !confirmDelete) {
            return;
          }
          const { org, repo, branch } = confirmDelete;
          setIsDeletingWorktree(true);
          try {
            const response = await fetch('/api/worktrees', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ org, repo, branch })
            });
            if (response.status === 401) {
              notifyAuthExpired();
              return;
            }
            if (!response.ok) {
              throw new Error(`Request failed with status ${response.status}`);
            }
            const body = await response.json();
            const payload = body && typeof body === 'object' && body.data ? body.data : {};
            applyDataUpdate(payload);
            const key = getWorktreeKey(org, repo, branch);
            const session = sessionMapRef.current.get(key);
            if (session) {
              sessionMapRef.current.delete(key);
              sessionKeyByIdRef.current.delete(session);
            }
            removeTrackedSession(key);
            if (
              activeWorktree &&
              activeWorktree.org === org &&
              activeWorktree.repo === repo &&
              activeWorktree.branch === branch
            ) {
              setActiveWorktree(null);
            }
            setConfirmDelete(null);
          } catch (error) {
            console.error('Failed to remove worktree', error);
            window.alert('Failed to remove worktree. Check server logs for details.');
          } finally {
            setIsDeletingWorktree(false);
          }
        };

        const handleWorktreeSelection = useCallback(
          async (org, repo, branch) => {
            if (branch === 'main') {
              clearDashboardPolling();
              setPendingWorktreeAction(null);
              setOpenActionMenu(null);
              setActiveWorktree(null);
              setSessionId(null);
              setTerminalStatus('disconnected');
              disposeSocket();
              disposeTerminal();
              closeGitSidebar();
              const cacheKey = `${org}::${repo}`;
              const cached = dashboardCacheRef.current.get(cacheKey);
              if (cached) {
                setDashboardData(cached);
                setDashboardError(null);
                setIsDashboardLoading(false);
              } else {
                setDashboardData(null);
                setIsDashboardLoading(true);
              }
              setActiveRepoDashboard({ org, repo });
              setIsMobileMenuOpen(false);
              return;
            }

            clearDashboardPolling();
            setActiveRepoDashboard(null);
            setDashboardError(null);
            setIsDashboardLoading(false);

            const worktree = { org, repo, branch };
            const key = getWorktreeKey(org, repo, branch);
            if (!sessionMapRef.current.has(key) && !knownSessionsRef.current.has(key)) {
              await loadSessions();
            }
            if (sessionMapRef.current.has(key) || knownSessionsRef.current.has(key)) {
              setActiveWorktree(worktree);
              let acknowledgementSet = false;
              let previousAcknowledgement;
              const metadata = sessionMetadataRef.current.get(key);
              if (metadata && metadata.idle) {
                previousAcknowledgement = idleAcknowledgementsRef.current.has(key)
                  ? idleAcknowledgementsRef.current.get(key)
                  : undefined;
                const nextAcknowledgements = new Map(idleAcknowledgementsRef.current);
                nextAcknowledgements.set(
                  key,
                  createIdleAcknowledgementEntry(getMetadataLastActivityMs(metadata)),
                );
                idleAcknowledgementsRef.current = nextAcknowledgements;
                setIdleAcknowledgementsSnapshot(new Map(nextAcknowledgements));
                acknowledgementSet = true;
              }
              try {
                await openTerminalForWorktree(worktree);
                setPendingWorktreeAction(null);
              } catch (error) {
                if (acknowledgementSet) {
                  const revertAcknowledgements = new Map(idleAcknowledgementsRef.current);
                  if (previousAcknowledgement === undefined) {
                    revertAcknowledgements.delete(key);
                  } else {
                    revertAcknowledgements.set(key, previousAcknowledgement);
                  }
                  idleAcknowledgementsRef.current = revertAcknowledgements;
                  setIdleAcknowledgementsSnapshot(new Map(revertAcknowledgements));
                }
                if (error && error.message === 'AUTH_REQUIRED') {
                  return;
                }
                window.alert('Failed to reconnect to the existing session.');
              }
            } else {
              setPendingWorktreeAction(worktree);
              setIsMobileMenuOpen(false);
            }
          },
          [
            clearDashboardPolling,
            closeGitSidebar,
            disposeSocket,
            disposeTerminal,
            getWorktreeKey,
            loadSessions,
            openTerminalForWorktree,
          ],
        );

        const handleWorktreeAction = useCallback(async (action) => {
          if (!pendingWorktreeAction || pendingActionLoading) {
            return;
          }
          setOpenActionMenu(null);
          setPendingActionLoading(action);
          clearDashboardPolling();
          setActiveRepoDashboard(null);
          setDashboardError(null);
          setIsDashboardLoading(false);
          const worktree = pendingWorktreeAction;
          const isDangerous = action.endsWith('-dangerous');
          const resolvedAction = isDangerous ? action.replace(/-dangerous$/, '') : action;
          const command = getCommandForLaunch(resolvedAction, isDangerous);
          setActiveWorktree(worktree);
          try {
            await openTerminalForWorktree(worktree, command ? { command } : {});
            setPendingWorktreeAction(null);
          } catch (error) {
            if (error && error.message === 'AUTH_REQUIRED') {
              return;
            }
            console.error('Failed to launch terminal action', error);
            window.alert('Failed to launch the selected option. Check server logs for details.');
          } finally {
            setPendingActionLoading(null);
          }
        }, [
          clearDashboardPolling,
          openTerminalForWorktree,
          pendingWorktreeAction,
          pendingActionLoading,
          setOpenActionMenu,
          getCommandForLaunch,
        ]);

        const handleDashboardRefresh = useCallback(() => {
          if (!activeRepoDashboard) {
            return;
          }
          fetchRepositoryDashboard(activeRepoDashboard.org, activeRepoDashboard.repo, { showLoading: true });
        }, [activeRepoDashboard, fetchRepositoryDashboard]);

        const isCodexLoading =
          Boolean(pendingActionLoading && typeof pendingActionLoading === 'string' && pendingActionLoading.startsWith('codex'));
        const isClaudeLoading =
          Boolean(pendingActionLoading && typeof pendingActionLoading === 'string' && pendingActionLoading.startsWith('claude'));
        const isCursorLoading =
          pendingActionLoading === 'cursor' || pendingActionLoading === 'ide';
        const showDangerousModeOption =
          worktreeLaunchOption === 'codex' || worktreeLaunchOption === 'claude';
        const isLaunchOptionDisabled = !branchName.trim();
        const dangerousModeCheckboxId = 'worktree-dangerous-mode';
        const promptDangerousModeCheckboxId = 'prompt-worktree-dangerous-mode';
        const promptPreviewHtml = useMemo(() => renderMarkdown(promptText), [promptText]);
        const promptPreviewIsEmpty = !promptPreviewHtml.trim();
        const showPromptDangerousModeOption = promptAgent === 'codex' || promptAgent === 'claude';
        const isPromptLaunchOptionDisabled = !promptText.trim();

        const logoutButton =
          typeof onLogout === 'function'
            ? h(
                'button',
                {
                  type: 'button',
                  onClick: onLogout,
                  disabled: Boolean(isLoggingOut),
                  'aria-busy': isLoggingOut ? 'true' : undefined,
                  className:
                    'inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900/90 px-3 py-2 text-xs font-medium text-neutral-200 shadow-sm transition-colors hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-70'
                },
                isLoggingOut
                  ? h(
                      Fragment,
                      null,
                      renderSpinner('text-neutral-200'),
                      h('span', null, 'Logging out…')
                    )
                  : h('span', null, 'Log out')
              )
            : null;

        const gitSidebarTotals = gitSidebarSnapshot?.totals || {};
        const gitSidebarOperations = gitSidebarSnapshot?.operations || {};
        const gitSidebarChangeCount =
          (gitSidebarTotals.staged || 0) +
          (gitSidebarTotals.unstaged || 0) +
          (gitSidebarTotals.untracked || 0) +
          (gitSidebarTotals.conflicts || 0);
        const gitSidebarBadgeLabel = gitSidebarChangeCount > 999 ? '999+' : String(gitSidebarChangeCount);
        const gitSidebarHasConflicts = (gitSidebarTotals.conflicts || 0) > 0;
        const gitSidebarHasOperations = Boolean(
          gitSidebarOperations.merge?.inProgress ||
            gitSidebarOperations.rebase?.inProgress ||
            gitSidebarOperations.cherryPick?.inProgress ||
            gitSidebarOperations.revert?.inProgress ||
            gitSidebarOperations.bisect?.inProgress
        );

        const githubRepoContext = activeWorktree || activeRepoDashboard;
        const githubRepoUrl = githubRepoContext
          ? `https://github.com/${githubRepoContext.org}/${githubRepoContext.repo}`
          : null;

        const githubMenuItems = githubRepoUrl
          ? [
              { key: 'pulls', label: 'Pull Requests', href: `${githubRepoUrl}/pulls` },
              { key: 'issues', label: 'Issues', href: `${githubRepoUrl}/issues` },
              { key: 'actions', label: 'Actions', href: `${githubRepoUrl}/actions` },
            ]
          : [];

        const githubControls =
          githubRepoUrl
            ? h(
                'div',
                {
                  className: 'relative flex items-center gap-1',
                  ref: githubMenuRef,
                },
                h(
                  'a',
                  {
                    href: githubRepoUrl,
                    target: '_blank',
                    rel: 'noreferrer noopener',
                className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`,
                    title: 'Open repository on GitHub',
                  },
                  h(Github, { size: 16 }),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: toggleGithubMenu,
                    className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`,
                    'aria-haspopup': 'true',
                    'aria-expanded': isGithubMenuOpen ? 'true' : 'false',
                    title: 'GitHub quick links',
                  },
                  h(ChevronDown, { size: 16 }),
                ),
                isGithubMenuOpen
                  ? h(
                      'div',
                      {
                        className:
                          'absolute right-0 top-full mt-2 w-44 rounded-md border border-neutral-800 bg-neutral-925 shadow-lg z-30 py-1',
                      },
                      githubMenuItems.map((item) =>
                        h(
                          'a',
                          {
                            key: item.key,
                            href: item.href,
                            target: '_blank',
                            rel: 'noreferrer noopener',
                            className:
                              'block px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 transition-colors',
                            onClick: closeGithubMenu,
                          },
                          item.label,
                        ),
                      ),
                    )
                  : null,
              )
            : null;

        const planHistoryButton =
          activeWorktree
            ? h(
                'button',
                {
                  type: 'button',
                  onClick: openPlanHistory,
                  className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`,
                  title: 'View saved plans',
                },
                planModal.open && planModal.loading
                  ? renderSpinner('text-neutral-100')
                  : h(ScrollText, { size: 16 })
              )
            : null;

        const taskMenuButton = h(TaskMenu, {
          tasks,
          isOpen: isTaskMenuOpen,
          onToggle: toggleTaskMenu,
          hasRunning: hasRunningTasks,
          menuRef: taskMenuRef,
        });

        const gitSidebarButton = activeWorktree
          ? h(
              'button',
              {
                type: 'button',
                onClick: toggleGitSidebar,
                className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`,
                'aria-pressed': isGitSidebarOpen ? 'true' : 'false',
                'aria-expanded': isGitSidebarOpen ? 'true' : 'false',
                title: isGitSidebarOpen ? 'Hide Git status sidebar' : 'Show Git status sidebar'
              },
              h(GitBranch, { size: 16 })
            )
          : null;

        const sidebarContent = h(
          'div',
          { className: 'flex h-full flex-col text-sm font-sans' },
          h(
            'div',
            { className: 'flex-1 min-h-0 overflow-y-auto p-3 space-y-5' },
            Object.entries(data).map(([org, repos]) => {
              const isOrganisationCollapsed = Boolean(collapsedOrganisations[org]);
              return h(
                'div',
                { key: org },
                h(
                  'div',
                  {
                    className:
                      'flex items-center justify-between text-neutral-400 uppercase tracking-wider text-xs mb-1 pl-1'
                  },
                  h('span', { className: 'truncate pr-2' }, org),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => toggleOrganisationCollapsed(org),
                      className:
                        'inline-flex h-6 w-6 items-center justify-center rounded-md text-neutral-500 transition-colors hover:text-neutral-200',
                      'aria-label': isOrganisationCollapsed
                        ? 'Expand organisation'
                        : 'Collapse organisation',
                      'aria-expanded': isOrganisationCollapsed ? 'false' : 'true'
                    },
                    h(ChevronDown, {
                      size: 14,
                      className: `transition-transform duration-200 ${
                        isOrganisationCollapsed ? '-rotate-90' : 'rotate-0'
                      }`
                    })
                  )
                ),
                !isOrganisationCollapsed &&
                  h(
                    'ul',
                    { className: 'space-y-2' },
                    Object.entries(repos).map(([repo, repoInfo]) => {
                      const branches = Array.isArray(repoInfo?.branches) ? repoInfo.branches : [];
                      const initCommand =
                        typeof repoInfo?.initCommand === 'string' ? repoInfo.initCommand : '';
                      const repoMenuKey = `repo-actions:${org}/${repo}`;
                      return h(
                        'li',
                        {
                          key: repo,
                          className:
                            'bg-neutral-900/60 hover:bg-neutral-900 transition-colors rounded-lg px-2 py-1.5',
                        },
                        h(
                          'div',
                          { className: 'flex items-center justify-between gap-2' },
                          h(
                            'div',
                            {
                              className:
                                'flex items-center space-x-2 cursor-pointer min-w-0 overflow-hidden',
                              onClick: () => {
                                const firstNonMain = branches.find((branch) => branch !== 'main');
                                if (firstNonMain) {
                                  handleWorktreeSelection(org, repo, firstNonMain).catch(() => {});
                                }
                              },
                            },
                            h(Github, { size: 14, className: 'text-neutral-400 flex-shrink-0' }),
                            h(
                              'span',
                              { className: 'text-neutral-200 whitespace-nowrap overflow-hidden' },
                              repo,
                            ),
                          ),
                            h(
                              'div',
                              { className: 'flex items-center gap-1 flex-shrink-0' },
                              h(
                                'div',
                                { className: 'relative', ref: getActionMenuRef(repoMenuKey) },
                                h(
                                  'button',
                                  {
                                    type: 'button',
                                    onClick: (event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      toggleActionMenu(repoMenuKey);
                                    },
                                    'aria-haspopup': 'menu',
                                    'aria-expanded': openActionMenu === repoMenuKey,
                                    className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-emerald-300`,
                                    title: 'Create worktree options',
                                  },
                                  h(Sparkles, { size: 14 }),
                                ),
                                openActionMenu === repoMenuKey
                                  ? h(
                                      'div',
                                      {
                                        role: 'menu',
                                        className:
                                          'absolute right-0 mt-2 min-w-[180px] overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 py-1 text-sm shadow-lg',
                                      },
                                      h(
                                      'button',
                                      {
                                        type: 'button',
                                        role: 'menuitem',
                                        onMouseDown: (event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          openPromptModalForRepo(org, repo);
                                        },
                                        className:
                                          'block w-full px-3 py-2 text-left text-neutral-100 transition hover:bg-neutral-800',
                                      },
                                      'Create From Prompt',
                                    ),
                                      h(
                                      'button',
                                      {
                                        type: 'button',
                                        role: 'menuitem',
                                        onMouseDown: (event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          openWorktreeModalForRepo(org, repo);
                                        },
                                        className:
                                          'block w-full px-3 py-2 text-left text-neutral-100 transition hover:bg-neutral-800',
                                      },
                                      'Create Worktree',
                                    ),
                                    )
                                  : null,
                              ),
                              h(
                                'button',
                                {
                                  type: 'button',
                                  onClick: () => {
                                    openRepoSettings(org, repo, initCommand);
                                  },
                                  className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-200`,
                                  title: 'Edit init command',
                                },
                                h(Settings, { size: 14 }),
                              ),
                            ),
                        ),
                        h(
                          'ul',
                          { className: 'ml-5 mt-1 space-y-[2px]' },
                          branches.map((branch) => {
                            const isActiveWorktree =
                              activeWorktree &&
                              activeWorktree.org === org &&
                              activeWorktree.repo === repo &&
                              activeWorktree.branch === branch;
                            const isDashboardActive =
                              branch === 'main' &&
                              activeRepoDashboard &&
                              activeRepoDashboard.org === org &&
                              activeRepoDashboard.repo === repo;
                            const isActive = Boolean(isActiveWorktree || isDashboardActive);
                            const worktreeKey = `${org}::${repo}::${branch}`;
                            const metadata = sessionMetadataSnapshot.get(worktreeKey);
                            const isIdle = Boolean(metadata?.idle);
                            const acknowledgementEntry = idleAcknowledgementsSnapshot.get(worktreeKey);
                            const isAcknowledged = isIdleAcknowledgementCurrent(
                              metadata,
                              acknowledgementEntry,
                            );
                            const shouldHighlightIdle =
                              branch !== 'main' && isIdle && !isAcknowledged && !isActive;

                            let rowClasses =
                              'text-neutral-500 hover:bg-neutral-800/70 hover:text-neutral-100';
                            if (branch === 'main') {
                              rowClasses =
                                'text-neutral-400 hover:bg-neutral-800/70 hover:text-neutral-100';
                            }
                            if (shouldHighlightIdle) {
                              rowClasses =
                                'text-emerald-400 hover:bg-neutral-800/70 hover:text-emerald-200';
                            }
                            if (isActive) {
                              rowClasses = 'bg-neutral-800 text-neutral-100';
                            }

                            return h(
                              'li',
                              { key: branch },
                              h(
                                'div',
                                {
                                  className: `flex items-center justify-between rounded-sm px-2 py-2 transition-colors ${rowClasses}`,
                                },
                                h(
                                  'button',
                                  {
                                    type: 'button',
                                    onClick: () =>
                                      handleWorktreeSelection(org, repo, branch).catch(() => {}),
                                    className:
                                      'flex items-center gap-2 min-w-0 overflow-hidden text-left w-full cursor-pointer',
                                  },
                                  h(GitBranch, { size: 14, className: 'flex-shrink-0' }),
                                  h(
                                    'span',
                                    {
                                      className:
                                        'whitespace-nowrap overflow-hidden text-ellipsis text-sm',
                                    },
                                    branch,
                                  ),
                                ),
                                h(
                                  'button',
                                  {
                                    type: 'button',
                                    onClick: () => {
                                      if (branch === 'main') {
                                        return;
                                      }
                                      setConfirmDelete({ org, repo, branch });
                                    },
                                    disabled: branch === 'main',
                                    className: `${ACTION_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-60 ${
                                      branch === 'main'
                                        ? 'text-neutral-700 cursor-not-allowed'
                                        : 'text-neutral-500 hover:text-red-400'
                                    }`,
                                    title:
                                      branch === 'main'
                                        ? 'Main branch cannot be removed'
                                        : 'Delete Worktree',
                                  },
                                  h(Trash2, { size: 12 }),
                                ),
                              ),
                            );
                          }),
                        ),
                      );
                    }),
                  )
              );
            })
          ),
          h(
            'div',
            { className: 'border-t border-neutral-800 bg-neutral-925/80 px-3 py-3' },
            h(
              'div',
              { className: 'flex items-center justify-between gap-3' },
              h(
                'button',
                {
                  onClick: () => setShowAddRepoModal(true),
                  className:
                    'inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs font-medium text-neutral-100 transition-colors hover:bg-neutral-800'
                },
                h(Plus, { size: 14 }),
                h('span', null, 'Add Repo')
              ),
              logoutButton
            )
          )
        );

        const desktopSidebar = h(
          Resizable,
          {
            size: { width, height: '100%' },
            onResizeStop: (_event, _direction, _ref, delta) => setWidth(width + delta.width),
            minWidth: 260,
            maxWidth: 540,
            className: 'border-r border-neutral-800 bg-neutral-925 relative hidden lg:block'
          },
          sidebarContent
        );

        const mobileSidebar = h(
          'div',
          {
            className: `lg:hidden fixed inset-0 z-40 bg-neutral-950/95 backdrop-blur-md transition-transform duration-150 ease-out ${
              isMobileMenuOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'
            }`
          },
          h(
            'div',
            { className: 'h-full w-[88vw] max-w-sm border-r border-neutral-800 bg-neutral-925 relative' },
            sidebarContent,
            h(
              'button',
              {
                onClick: () => setIsMobileMenuOpen(false),
                className: 'absolute top-3 right-3 text-neutral-400 hover:text-neutral-100 transition-colors'
              },
              h(X, { size: 16 })
            )
          )
        );

        let mainPaneContent = null;

        if (activeWorktree) {
          mainPaneContent = h(
            'div',
            {
              className:
                'bg-neutral-900 border border-neutral-800 rounded-lg h-full flex flex-col overflow-hidden min-h-0 flex-1',
            },
            h(
              'div',
              { className: 'flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/80' },
              h(
                'div',
                null,
                h(
                  'div',
                  { className: 'text-xs text-neutral-500' },
                  `${activeWorktree.org}/${activeWorktree.repo}`,
                ),
                h('div', { className: 'text-sm text-neutral-300 flex items-center gap-2' }, h('span', null, activeWorktree.branch)),
              ),
              h(
                'div',
                { className: 'flex items-center gap-2' },
                githubControls,
                taskMenuButton,
                planHistoryButton,
                gitSidebarButton,
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setIsMobileMenuOpen(true),
                    className:
                      'lg:hidden inline-flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-925 px-2.5 py-2 text-sm text-neutral-300 shadow-sm transition active:scale-[0.97]',
                  },
                  h(Menu, { size: 18 }),
                  h('span', { className: 'sr-only' }, 'Open sidebar'),
                ),
              ),
            ),
            h(
              'div',
              { className: 'flex-1 min-h-0 flex flex-col lg:flex-row lg:min-w-0' },
              h('div', {
                ref: terminalContainerRef,
                className: 'flex-1 bg-neutral-950 min-h-0 min-w-0 overflow-hidden relative',
              }),
              h(GitStatusSidebar, {
                isOpen: isGitSidebarOpen,
                worktree: activeWorktree,
                onClose: closeGitSidebar,
                onAuthExpired: notifyAuthExpired,
                onStatusUpdate: handleGitStatusUpdate,
                onOpenDiff: handleOpenGitDiff,
                entryLimit: 250,
                commitLimit: 20,
                pollInterval: REPOSITORY_POLL_INTERVAL_MS,
              }),
            ),
          );
        } else if (activeRepoDashboard) {
          mainPaneContent = h(
            'div',
            {
              className:
                'bg-neutral-900 border border-neutral-800 rounded-lg h-full flex flex-col overflow-hidden min-h-0 flex-1',
            },
            h(
              'div',
              { className: 'flex items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-900/80' },
              h(
                'div',
                null,
                h(
                  'div',
                  { className: 'text-xs text-neutral-500' },
                  `${activeRepoDashboard.org}/${activeRepoDashboard.repo}`,
                ),
                h('div', { className: 'text-sm text-neutral-300' }, 'Repository Dashboard'),
              ),
              h(
                'div',
                { className: 'flex items-center gap-2' },
                githubControls,
                taskMenuButton,
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: handleDashboardRefresh,
                    disabled: isDashboardLoading,
                    className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100 disabled:opacity-60 disabled:cursor-not-allowed`,
                    title: isDashboardLoading ? 'Refreshing…' : 'Refresh metrics',
                  },
                  isDashboardLoading
                    ? renderSpinner('text-neutral-100')
                    : h(RefreshCcw, { size: 16 }),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => setIsMobileMenuOpen(true),
                    className:
                      'lg:hidden inline-flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-925 px-2.5 py-2 text-sm text-neutral-300 shadow-sm transition active:scale-[0.97]',
                  },
                  h(Menu, { size: 18 }),
                  h('span', { className: 'sr-only' }, 'Open sidebar'),
                ),
              ),
            ),
            h(
              'div',
              { className: 'flex-1 min-h-0 overflow-y-auto p-4' },
              h(RepositoryDashboard, {
                repository: activeRepoDashboard,
                data: dashboardData,
                loading: isDashboardLoading,
                error: dashboardError,
                onCreateIssuePlan: openIssuePlanModal,
              }),
            ),
          );
        } else {
          mainPaneContent = h(
            'div',
            {
              className:
                'bg-neutral-900 border border-neutral-800 rounded-lg h-full flex flex-col overflow-hidden min-h-0',
            },
            h(
              'div',
              { className: 'flex justify-end items-center gap-2 px-4 py-3 border-b border-neutral-800 bg-neutral-900/80' },
              taskMenuButton,
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => setIsMobileMenuOpen(true),
                  className:
                    'lg:hidden inline-flex items-center justify-center rounded-md border border-neutral-800 bg-neutral-925 px-2.5 py-2 text-sm text-neutral-300 shadow-sm transition active:scale-[0.97]',
                },
                h(Menu, { size: 18 }),
                h('span', { className: 'sr-only' }, 'Open sidebar'),
              ),
            ),
            h(
              'div',
              {
                className: 'flex-1 flex items-center justify-center text-neutral-500 px-4 text-center',
              },
              h('p', null, 'Select a repository and branch from the left panel'),
            ),
          );
        }

        const mainPane = h(
          'div',
          { className: 'flex-1 bg-neutral-950 text-neutral-100 font-sans flex flex-col min-h-0' },
          mainPaneContent,
        );

        return h(
          Fragment,
          null,
          h(
            'div',
            { className: 'flex h-screen bg-neutral-950 text-neutral-100 relative flex-col lg:flex-row min-h-0' },
            desktopSidebar,
            mobileSidebar,
            h(
              'div',
              { className: 'flex-1 h-full w-full lg:w-auto overflow-hidden flex flex-col min-h-0' },
              mainPane
            )
          ),
          showAddRepoModal
            ? h(
                Modal,
                { title: 'Add repository', onClose: () => setShowAddRepoModal(false) },
                h(
                  'div',
                  { className: 'space-y-2' },
                  h(
                    'label',
                    { className: 'block text-xs uppercase tracking-wide text-neutral-400' },
                    'Repository URL'
                  ),
                  h('input', {
                    value: repoUrl,
                    onChange: event => setRepoUrl(event.target.value),
                    placeholder: 'https://github.com/org/repo.git',
                    className:
                      'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60'
                  })
                ),
                h(
                  'div',
                  { className: 'space-y-2 pt-2' },
                  h(
                    'label',
                    { className: 'block text-xs uppercase tracking-wide text-neutral-400' },
                    'Init command (optional)'
                  ),
                  h('textarea', {
                    value: repoInitCommand,
                    onChange: event => setRepoInitCommand(event.target.value),
                    placeholder: 'npm install',
                    rows: 3,
                    className:
                      'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60 resize-y min-h-[92px]'
                  }),
                  h(
                    'p',
                    { className: 'text-xs text-neutral-500 leading-relaxed' },
                    'Runs once after each new worktree is created. Leave blank to skip.'
                  )
                ),
                h(
                  'div',
                  { className: 'flex justify-end gap-2 pt-2' },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => setShowAddRepoModal(false),
                      className: 'px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200'
                    },
                    'Cancel'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: handleAddRepo,
                      disabled: isAddingRepo,
                      'aria-busy': isAddingRepo,
                      className:
                        'px-3 py-2 text-sm bg-emerald-500/80 hover:bg-emerald-400 text-neutral-900 font-medium rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-emerald-500/80'
                    },
                    isAddingRepo
                      ? h(
                          'span',
                          { className: 'inline-flex items-center gap-2' },
                          renderSpinner('text-neutral-900'),
                          'Adding…'
                        )
                      : 'Add repository'
                  )
                )
              )
            : null,
          editInitCommandModal.open
            ? h(
                Modal,
                {
                  title: `Repository settings: ${editInitCommandModal.org}/${editInitCommandModal.repo}`,
                  onClose: () => {
                    if (editInitCommandModal.saving) {
                      return;
                    }
                    closeEditInitCommandModal();
                  },
                },
                h(
                  'div',
                  { className: 'space-y-5' },
                  h(
                    'section',
                    { className: 'space-y-2' },
                    h(
                      'p',
                      { className: 'text-xs text-neutral-400 leading-relaxed' },
                      'This command runs after new worktrees for this repository are created.',
                    ),
                    h('textarea', {
                      value: editInitCommandModal.value,
                      onChange: (event) =>
                        setEditInitCommandModal((current) => ({
                          ...current,
                          value: event.target.value,
                        })),
                      rows: 4,
                      disabled: editInitCommandModal.saving,
                      className:
                        'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60 resize-y min-h-[112px]',
                      placeholder: 'npm install',
                    }),
                    h(
                      'p',
                      { className: 'text-xs text-neutral-500 leading-relaxed' },
                      'Leave blank to skip running a setup command.',
                    ),
                    editInitCommandModal.error
                      ? h(
                          'p',
                          { className: 'text-xs text-rose-400' },
                          editInitCommandModal.error,
                        )
                      : null,
                  ),
                  h(
                    'section',
                    { className: 'space-y-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-3' },
                    h(
                      'div',
                      { className: 'space-y-1' },
                      h(
                        'p',
                        { className: 'text-sm font-semibold text-rose-100' },
                        'Danger zone',
                      ),
                      h(
                        'p',
                        { className: 'text-xs text-rose-100/80 leading-relaxed' },
                        'Deleting this repository removes all worktrees, terminal sessions, and local checkout data.',
                      ),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: requestRepoDeletionFromSettings,
                        disabled: editInitCommandModal.saving || isDeletingRepo,
                        'aria-busy': isDeletingRepo ? 'true' : undefined,
                        className:
                          'inline-flex items-center justify-center gap-2 rounded-md border border-rose-400/60 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-100 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60',
                      },
                      isDeletingRepo
                        ? h(
                            'span',
                            { className: 'inline-flex items-center gap-2' },
                            renderSpinner('text-rose-50'),
                            'Deleting…',
                          )
                        : 'Delete repository',
                    ),
                  ),
                ),
                h(
                  'div',
                  { className: 'flex justify-end gap-2 pt-2' },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: closeEditInitCommandModal,
                      disabled: editInitCommandModal.saving,
                      className:
                        'px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-60',
                    },
                    'Cancel',
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: handleSaveInitCommand,
                      disabled: editInitCommandModal.saving,
                      'aria-busy': editInitCommandModal.saving ? 'true' : undefined,
                      className:
                        'px-3 py-2 text-sm bg-emerald-500/80 hover:bg-emerald-400 text-neutral-900 font-medium rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-emerald-500/80',
                    },
                    editInitCommandModal.saving
                      ? h(
                          'span',
                          { className: 'inline-flex items-center gap-2' },
                          renderSpinner('text-neutral-900'),
                          'Saving…',
                        )
                      : 'Save command',
                  ),
                ),
              )
            : null,
          gitDiffModal.open
            ? h(
                Modal,
                {
                  title: gitDiffModal.file?.path ? `Diff: ${gitDiffModal.file.path}` : 'File diff',
                  onClose: handleCloseGitDiff,
                  size: 'lg',
                },
                h(
                  'div',
                  { className: 'space-y-3' },
                  h(
                    'div',
                    { className: 'flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500' },
                    h(
                      'div',
                      { className: 'space-y-1' },
                      gitDiffModal.file?.previousPath
                        ? h(
                            'p',
                            null,
                            `Renamed from ${gitDiffModal.file.previousPath}`
                          )
                        : null,
                      gitDiffModal.file?.mode
                        ? h(
                            'p',
                            null,
                            `Diff mode: ${gitDiffModal.file.mode}`
                          )
                        : null,
                    ),
                    h(
                      'div',
                      { className: 'flex items-center gap-2' },
                      h(
                        'button',
                        {
                          type: 'button',
                          onClick: toggleDiffView,
                          className:
                            'inline-flex items-center gap-2 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-200 transition hover:bg-neutral-800',
                        },
                        gitDiffModal.view === 'split' ? 'Show unified' : 'Show split'
                      )
                    )
                  ),
                  gitDiffModal.loading
                    ? h(
                        'div',
                        { className: 'flex items-center gap-2 text-sm text-neutral-300' },
                        renderSpinner('text-neutral-200'),
                        h('span', null, 'Loading diff…')
                      )
                    : gitDiffModal.error
                    ? h(
                        'p',
                        { className: 'text-sm text-rose-300' },
                        gitDiffModal.error
                      )
                    : h(
                        DiffViewer,
                        {
                          diff: gitDiffModal.diff,
                          view: gitDiffModal.view,
                        }
                      )
                )
              )
            : null,
          planModal.open
            ? h(
                Modal,
                {
                  title: planModal.context
                    ? `Plans for ${planModal.context.org}/${planModal.context.repo}`
                    : 'Plans',
                  onClose: handleClosePlanModal,
                  size: 'lg',
                },
                h(
                  'div',
                  { className: 'space-y-4' },
                  planModal.context
                    ? h(
                        'p',
                        { className: 'text-xs text-neutral-400' },
                        `Branch: ${planModal.context.branch}`
                      )
                    : null,
                  planModal.loading
                    ? h(
                        'div',
                        { className: 'flex items-center gap-2 text-sm text-neutral-200' },
                        renderSpinner('text-neutral-100'),
                        h('span', null, 'Loading plans…')
                      )
                    : planModal.error
                    ? h('p', { className: 'text-sm text-rose-300' }, planModal.error)
                    : h(
                        'div',
                        { className: 'flex flex-col gap-4 lg:flex-row lg:gap-6' },
                        h(
                          'div',
                          { className: 'lg:w-60 flex-shrink-0' },
                          planModal.plans.length > 0
                            ? h(
                                'div',
                                { className: 'space-y-2 max-h-[320px] overflow-y-auto pr-1' },
                                planModal.plans.map((plan) => {
                                  const isActive = plan.id === planModal.selectedPlanId;
                                  const timestampLabel = formatPlanTimestamp(plan.createdAt);
                                  return h(
                                    'button',
                                    {
                                      key: plan.id,
                                      type: 'button',
                                      onClick: () => handleSelectPlan(plan.id),
                                      className: [
                                        'w-full text-left rounded-md border px-3 py-2 text-sm transition-colors',
                                        isActive
                                          ? 'border-emerald-500/70 bg-emerald-500/10 text-emerald-100'
                                          : 'border-neutral-800 bg-neutral-950 text-neutral-300 hover:bg-neutral-900'
                                      ].join(' ')
                                    },
                                    h('div', { className: 'font-medium truncate' }, timestampLabel),
                                    h(
                                      'div',
                                      { className: 'text-xs text-neutral-400 mt-1 truncate' },
                                      plan.id
                                    )
                                  );
                                })
                              )
                            : h(
                                'p',
                                { className: 'text-sm text-neutral-400' },
                                'No plans saved for this worktree yet.'
                              ),
                        ),
                        h(
                          'div',
                          {
                            className:
                              'flex-1 min-h-[220px] max-h-[420px] overflow-y-auto rounded-md border border-neutral-800 bg-neutral-950 px-3 py-3',
                          },
                          planModal.contentLoading
                            ? h(
                                'div',
                                { className: 'flex items-center gap-2 text-sm text-neutral-200' },
                                renderSpinner('text-neutral-100'),
                                h('span', null, 'Loading plan…')
                              )
                            : planModal.contentError
                            ? h('p', { className: 'text-sm text-rose-300' }, planModal.contentError)
                            : planModal.selectedPlanId
                            ? h(
                                'div',
                                { className: 'space-y-3 text-sm text-neutral-100' },
                                selectedPlan
                                  ? h(
                                      'div',
                                      {
                                        className:
                                          'flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800 pb-2 text-xs text-neutral-400',
                                      },
                                      h('span', { className: 'truncate max-w-[60%]' }, selectedPlan.id),
                                      h('span', null, formatPlanTimestamp(selectedPlan.createdAt))
                                    )
                                  : null,
                                planModal.content
                                  ? h('div', {
                                      className: 'markdown-preview__content space-y-3',
                                      dangerouslySetInnerHTML: { __html: planModalContentHtml },
                                    })
                                  : h('p', { className: 'text-sm text-neutral-400' }, 'Plan is empty.')
                              )
                            : h('p', { className: 'text-sm text-neutral-400' }, 'Select a plan to view.'),
                        ),
                      ),
                )
              )
            : null,
          showPromptWorktreeModal && selectedRepo
            ? h(
                Modal,
                {
                  title: `Create worktree from prompt for ${selectedRepo[1]}`,
                  onClose: () => {
                    if (!isCreatingPromptWorktree) {
                      setShowPromptWorktreeModal(false);
                      setPromptInputMode('edit');
                    }
                  },
                  size: 'lg',
                  position: 'top'
                },
                h(
                  'div',
                  { className: 'space-y-4' },
                  h(
                    'div',
                    { className: 'space-y-3' },
                    h(
                      'div',
                      { className: 'flex items-center justify-between gap-3' },
                      h(
                        'label',
                        { className: 'block text-xs uppercase tracking-wide text-neutral-400' },
                        'Prompt'
                      ),
                      h(
                        'div',
                        {
                          className:
                            'inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-950 p-0.5'
                        },
                        PROMPT_EDITOR_TABS.map(tab => {
                          const isActive = promptInputMode === tab.value;
                          return h(
                            'button',
                            {
                              key: tab.value,
                              type: 'button',
                              onClick: () => setPromptInputMode(tab.value),
                              className: [
                                'rounded-md px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500/70',
                                isActive
                                  ? 'bg-neutral-800 text-neutral-100 shadow-inner'
                                  : 'text-neutral-400 hover:text-neutral-200'
                              ].join(' '),
                              'aria-pressed': isActive
                            },
                            tab.label
                          );
                        })
                      )
                    ),
                    promptInputMode === 'edit'
                      ? h(
                          Fragment,
                          null,
                          h('textarea', {
                            value: promptText,
                            onChange: event => setPromptText(event.target.value),
                            placeholder: 'Describe the changes you need…',
                            rows: 8,
                            className:
                              'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60 resize-y min-h-[200px]'
                          }),
                          // Let users pre-generate a plan before opening the agent workspace.
                          h(
                            'button',
                            {
                              type: 'button',
                              onClick: handleCreatePlan,
                              disabled: isCreatingPlan || !promptText.trim(),
                              'aria-busy': isCreatingPlan,
                              className:
                                'mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md border border-neutral-700 bg-neutral-925 px-3 py-2 text-sm text-neutral-200 transition-colors hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-neutral-925'
                            },
                            isCreatingPlan
                              ? h(
                                  'span',
                                  { className: 'inline-flex items-center gap-2' },
                                  renderSpinner('text-neutral-200'),
                                  'Creating…'
                                )
                              : 'Create Plan'
                          )
                        )
                      : h(
                          'div',
                          {
                            className:
                              'markdown-preview min-h-[200px] max-h-[400px] w-full overflow-y-auto rounded-md border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-neutral-100 leading-relaxed'
                          },
                          promptPreviewIsEmpty
                            ? h(
                                'p',
                                { className: 'text-sm text-neutral-500 italic' },
                                'Nothing to preview yet.'
                              )
                            : h('div', {
                                className: 'markdown-preview__content space-y-3',
                                dangerouslySetInnerHTML: { __html: promptPreviewHtml }
                              })
                        )
                  ),
                  h(
                    'div',
                    { className: 'space-y-2' },
                    h(
                      'label',
                      { className: 'block text-xs uppercase tracking-wide text-neutral-400' },
                      'Agent'
                    ),
                    h(
                      'div',
                      { className: 'grid grid-cols-3 gap-2' },
                      PROMPT_AGENT_OPTIONS.map(option => {
                        const isActive = promptAgent === option.value;
                        return h(
                          'button',
                          {
                            key: option.value,
                            type: 'button',
                            onClick: () => {
                              setPromptAgent(option.value);
                              if (option.value === 'cursor') {
                                setPromptDangerousMode(false);
                              }
                            },
                            className: [
                              'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                              isActive
                                ? 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200'
                                : 'border-neutral-700 bg-neutral-950 text-neutral-300 hover:bg-neutral-900'
                            ].join(' ')
                          },
                          option.label
                        );
                      })
                    )
                  ),
                  showPromptDangerousModeOption
                    ? h(
                        'label',
                        {
                          className: 'inline-flex items-center gap-2 text-xs text-neutral-300',
                          htmlFor: promptDangerousModeCheckboxId
                        },
                        h('input', {
                          id: promptDangerousModeCheckboxId,
                          type: 'checkbox',
                          checked: promptDangerousMode,
                          onChange: event => setPromptDangerousMode(event.target.checked),
                          className:
                            'h-4 w-4 rounded border border-neutral-700 bg-neutral-950 text-neutral-100 focus:ring-1 focus:ring-neutral-500'
                        }),
                        'Start in Dangerous Mode'
                      )
                    : null,
                  h(
                    'p',
                    { className: 'text-xs text-neutral-400' },
                    'Branch name will be generated automatically based on your prompt.'
                  )
                ),
                h(
                  'div',
                  { className: 'flex justify-end gap-2 pt-4' },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        if (!isCreatingPromptWorktree) {
                          setShowPromptWorktreeModal(false);
                          setPromptInputMode('edit');
                        }
                      },
                      disabled: isCreatingPromptWorktree,
                      className:
                        'px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-neutral-400'
                    },
                    'Cancel'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: handleCreateWorktreeFromPrompt,
                      disabled: isCreatingPromptWorktree || isPromptLaunchOptionDisabled,
                      'aria-busy': isCreatingPromptWorktree,
                      className:
                        'px-3 py-2 text-sm bg-emerald-500/80 hover:bg-emerald-400 text-neutral-900 font-medium rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-emerald-500/80'
                    },
                    isCreatingPromptWorktree
                      ? h(
                          'span',
                          { className: 'inline-flex items-center gap-2' },
                          renderSpinner('text-neutral-900'),
                          'Launching…'
                        )
                      : 'Create workspace'
                  )
                )
              )
            : null,
          showWorktreeModal && selectedRepo
            ? h(
                Modal,
                {
                  title: `Create worktree for ${selectedRepo[1]}`,
                  onClose: () => {
                    setShowWorktreeModal(false);
                    setWorktreeLaunchOption('terminal');
                    setLaunchDangerousMode(false);
                  }
                },
                h(
                  'div',
                  { className: 'space-y-3' },
                  h(
                    'label',
                    { className: 'block text-xs uppercase tracking-wide text-neutral-400' },
                    'Branch name'
                  ),
                  h('input', {
                    value: branchName,
                    onChange: event => setBranchName(event.target.value),
                    onKeyDown: event => {
                      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                        event.preventDefault();
                        if (!isCreatingWorktree) {
                          handleCreateWorktree();
                        }
                      }
                    },
                    placeholder: 'feature/my-awesome-branch',
                    className:
                      'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60'
                  }),
                  h(
                    Fragment,
                    null,
                    h(
                      'label',
                      { className: 'block text-xs uppercase tracking-wide text-neutral-400' },
                      'Launch option'
                    ),
                    h(
                      'select',
                      {
                        value: worktreeLaunchOption,
                        onChange: event => {
                          setWorktreeLaunchOption(event.target.value);
                          setLaunchDangerousMode(false);
                        },
                        disabled: isLaunchOptionDisabled,
                        className:
                          'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-neutral-500/60 disabled:cursor-not-allowed disabled:opacity-60'
                      },
                      WORKTREE_LAUNCH_OPTIONS.map(option =>
                        h(
                          'option',
                          { key: option.value, value: option.value },
                          option.label
                        )
                      )
                    )
                  ),
                  showDangerousModeOption
                    ? h(
                        'label',
                        {
                          className:
                            'inline-flex items-center gap-2 text-xs text-neutral-300',
                          htmlFor: dangerousModeCheckboxId
                        },
                        h('input', {
                          id: dangerousModeCheckboxId,
                          type: 'checkbox',
                          checked: launchDangerousMode,
                          onChange: event => setLaunchDangerousMode(event.target.checked),
                          disabled: isLaunchOptionDisabled,
                          className:
                            'h-4 w-4 rounded border border-neutral-700 bg-neutral-950 text-neutral-100 focus:ring-1 focus:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-60'
                        }),
                        'Start in Dangerous Mode'
                      )
                    : null
                ),
                h(
                  'div',
                  { className: 'flex justify-end gap-2 pt-2' },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        setShowWorktreeModal(false);
                        setWorktreeLaunchOption('terminal');
                        setLaunchDangerousMode(false);
                      },
                      className: 'px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200'
                    },
                    'Cancel'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: handleCreateWorktree,
                      disabled: isCreatingWorktree || !branchName.trim(),
                      'aria-busy': isCreatingWorktree,
                      className:
                        'px-3 py-2 text-sm bg-emerald-500/80 hover:bg-emerald-400 text-neutral-900 font-medium rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-emerald-500/80'
                    },
                    isCreatingWorktree
                      ? h(
                          'span',
                          { className: 'inline-flex items-center gap-2' },
                          renderSpinner('text-neutral-900'),
                          'Creating…'
                        )
                      : 'Create worktree'
                  )
                )
              )
            : null,
          confirmDelete
            ? h(
                Modal,
                {
                  title: 'Remove worktree',
                  onClose: () => {
                    if (!isDeletingWorktree) {
                      setConfirmDelete(null);
                    }
                  }
                },
                h(
                  'div',
                  { className: 'space-y-3 text-sm text-neutral-300' },
                  h(
                    'p',
                    null,
                    `Remove ${confirmDelete.branch} from ${confirmDelete.repo}?`
                  ),
                  h(
                    'p',
                    { className: 'text-xs text-neutral-500' },
                    'This only detaches the worktree locally. The Git branch remains.'
                  )
                ),
                h(
                  'div',
                  { className: 'flex justify-end gap-2 pt-3' },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        if (!isDeletingWorktree) {
                          setConfirmDelete(null);
                        }
                      },
                      disabled: isDeletingWorktree,
                      className:
                        'px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-neutral-400'
                    },
                    'Cancel'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: handleConfirmDelete,
                      disabled: isDeletingWorktree,
                      'aria-busy': isDeletingWorktree,
                      className:
                        'px-3 py-2 text-sm bg-rose-500/80 hover:bg-rose-400 text-neutral-50 font-medium rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-rose-500/80'
                    },
                    isDeletingWorktree
                      ? h(
                          'span',
                          { className: 'inline-flex items-center gap-2' },
                          renderSpinner('text-neutral-50'),
                          'Removing…'
                        )
                      : 'Remove'
                  )
                )
              )
            : null,
          confirmDeleteRepo
            ? h(
                Modal,
                {
                  title: 'Delete repository',
                  onClose: () => {
                    if (!isDeletingRepo) {
                      reopenRepoSettingsAfterConfirm(confirmDeleteRepo);
                      setConfirmDeleteRepo(null);
                    }
                  }
                },
                h(
                  'div',
                  { className: 'space-y-3 text-sm text-neutral-300' },
                  h(
                    'p',
                    null,
                    `Delete ${confirmDeleteRepo.org}/${confirmDeleteRepo.repo}?`
                  ),
                  h(
                    'p',
                    { className: 'text-xs text-neutral-500' },
                    'This permanently removes all associated worktrees, terminal sessions, and local checkout data.'
                  )
                ),
                h(
                  'div',
                  { className: 'flex justify-end gap-2 pt-3' },
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: () => {
                        if (!isDeletingRepo) {
                          reopenRepoSettingsAfterConfirm(confirmDeleteRepo);
                          setConfirmDeleteRepo(null);
                        }
                      },
                      disabled: isDeletingRepo,
                      className:
                        'px-3 py-2 text-sm text-neutral-400 hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-neutral-400'
                    },
                    'Cancel'
                  ),
                  h(
                    'button',
                    {
                      type: 'button',
                      onClick: handleConfirmDeleteRepo,
                      disabled: isDeletingRepo,
                      'aria-busy': isDeletingRepo,
                      className:
                        'px-3 py-2 text-sm bg-rose-500/80 hover:bg-rose-400 text-neutral-50 font-medium rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-rose-500/80'
                    },
                    isDeletingRepo
                      ? h(
                          'span',
                          { className: 'inline-flex items-center gap-2' },
                          renderSpinner('text-neutral-50'),
                          'Deleting…'
                        )
                      : 'Delete'
                  )
                )
              )
            : null,
          pendingWorktreeAction
            ? h(
                Modal,
                {
                  title: `Open ${pendingWorktreeAction.repo}`,
                  onClose: () => {
                    if (!pendingActionLoading) {
                      setPendingWorktreeAction(null);
                    }
                  }
                },
                h(
                  'div',
                  { className: 'space-y-3 text-sm text-neutral-300' },
                  h(
                    'p',
                    null,
                    'Choose how you want to start working in this worktree:'
                  ),
                  h(
                    'div',
                    { className: 'space-y-2' },
                    h(
                      'button',
                      {
                        onClick: () => handleWorktreeAction('terminal'),
                        disabled: Boolean(pendingActionLoading),
                        'aria-busy': pendingActionLoading === 'terminal',
                        className:
                          'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
                      },
                      pendingActionLoading === 'terminal'
                        ? h(
                            'span',
                            { className: 'inline-flex items-center gap-2' },
                            renderSpinner('text-neutral-100'),
                            'Opening…'
                          )
                        : 'Open Terminal'
                    ),
                    h(
                      'button',
                      {
                        onClick: () => handleWorktreeAction('vscode'),
                        disabled: Boolean(pendingActionLoading),
                        'aria-busy': pendingActionLoading === 'vscode',
                        className:
                          'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
                      },
                      pendingActionLoading === 'vscode'
                        ? h(
                            'span',
                            { className: 'inline-flex items-center gap-2' },
                            renderSpinner('text-neutral-100'),
                            'Opening…'
                          )
                        : 'Open in VS Code'
                    ),
                    h(
                      'div',
                      {
                        className: 'flex items-stretch gap-2',
                        ref: getActionMenuRef('codex')
                      },
                      h(
                        'button',
                        {
                          onClick: () => handleWorktreeAction('codex'),
                          disabled: Boolean(pendingActionLoading),
                          'aria-busy': isCodexLoading,
                          className:
                            'flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
                        },
                        isCodexLoading
                          ? h(
                              'span',
                              { className: 'inline-flex items-center gap-2' },
                              renderSpinner('text-neutral-100'),
                              'Opening…'
                            )
                          : 'Open Codex'
                      ),
                      h(
                        'div',
                        { className: 'relative' },
                        h(
                          'button',
                          {
                            type: 'button',
                            onClick: (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleActionMenu('codex');
                            },
                            disabled: Boolean(pendingActionLoading),
                            'aria-label': 'Open Codex options',
                            'aria-haspopup': 'menu',
                            'aria-expanded': openActionMenu === 'codex',
                            className:
                              'h-full rounded-md border border-neutral-700 bg-neutral-900 px-2 text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900 flex items-center justify-center'
                          },
                          h(ChevronDown, { size: 14 })
                        ),
                        openActionMenu === 'codex'
                          ? h(
                              'div',
                              {
                                role: 'menu',
                                className:
                                  'absolute right-0 mt-2 w-48 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 py-1 text-sm shadow-lg z-10'
                              },
                              h(
                                'button',
                                {
                                  type: 'button',
                                  role: 'menuitem',
                                  onClick: () => handleWorktreeAction('codex-dangerous'),
                                  className:
                                    'block w-full px-3 py-2 text-left text-neutral-100 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60',
                                  disabled: Boolean(pendingActionLoading)
                                },
                                'Dangerous Mode'
                              )
                            )
                          : null
                      )
                    ),
                    h(
                      'button',
                      {
                        onClick: () => handleWorktreeAction('cursor'),
                        disabled: Boolean(pendingActionLoading),
                        'aria-busy': isCursorLoading,
                        className:
                          'w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
                      },
                      isCursorLoading
                        ? h(
                            'span',
                            { className: 'inline-flex items-center gap-2' },
                            renderSpinner('text-neutral-100'),
                            'Launching…'
                          )
                        : 'Launch Cursor'
                    ),
                    h(
                      'div',
                      {
                        className: 'flex items-stretch gap-2',
                        ref: getActionMenuRef('claude')
                      },
                      h(
                        'button',
                        {
                          onClick: () => handleWorktreeAction('claude'),
                          disabled: Boolean(pendingActionLoading),
                          'aria-busy': isClaudeLoading,
                          className:
                            'flex-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900'
                        },
                        isClaudeLoading
                          ? h(
                              'span',
                              { className: 'inline-flex items-center gap-2' },
                              renderSpinner('text-neutral-100'),
                              'Opening…'
                            )
                          : 'Open Claude'
                      ),
                      h(
                        'div',
                        { className: 'relative' },
                        h(
                          'button',
                          {
                            type: 'button',
                            onClick: (event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              toggleActionMenu('claude');
                            },
                            disabled: Boolean(pendingActionLoading),
                            'aria-label': 'Open Claude options',
                            'aria-haspopup': 'menu',
                            'aria-expanded': openActionMenu === 'claude',
                            className:
                              'h-full rounded-md border border-neutral-700 bg-neutral-900 px-2 text-neutral-100 hover:border-neutral-500 hover:bg-neutral-850 transition-colors disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-neutral-900 flex items-center justify-center'
                          },
                          h(ChevronDown, { size: 14 })
                        ),
                        openActionMenu === 'claude'
                          ? h(
                              'div',
                              {
                                role: 'menu',
                                className:
                                  'absolute right-0 mt-2 w-48 overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 py-1 text-sm shadow-lg z-10'
                              },
                              h(
                                'button',
                                {
                                  type: 'button',
                                  role: 'menuitem',
                                  onClick: () => handleWorktreeAction('claude-dangerous'),
                                  className:
                                    'block w-full px-3 py-2 text-left text-neutral-100 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60',
                                  disabled: Boolean(pendingActionLoading)
                                },
                                'Dangerous Mode'
                              )
                            )
                          : null
                      )
                    )
                  )
                )
              )
            : null
        );
      }

export default function App() {
        const [authStatus, setAuthStatus] = useState('checking');
        const [isLoggingOut, setIsLoggingOut] = useState(false);

        const checkAuthStatus = useCallback(async () => {
          try {
            const response = await fetch('/api/auth/status', { credentials: 'include' });
            if (!response.ok) {
              setAuthStatus('unauthenticated');
              return;
            }
            const body = await response.json();
            setAuthStatus(body && body.authenticated ? 'authenticated' : 'unauthenticated');
          } catch (error) {
            setAuthStatus('unauthenticated');
          }
        }, []);

        useEffect(() => {
          checkAuthStatus();
        }, [checkAuthStatus]);

        const handleAuthenticated = useCallback(() => {
          setAuthStatus('authenticated');
          checkAuthStatus();
        }, [checkAuthStatus]);

        const handleAuthExpired = useCallback(() => {
          setIsLoggingOut(false);
          setAuthStatus('unauthenticated');
        }, []);

        const handleLogout = useCallback(async () => {
          if (isLoggingOut) {
            return;
          }
          setIsLoggingOut(true);
          try {
            await fetch('/api/auth/logout', {
              method: 'POST',
              credentials: 'include'
            });
          } catch {
          } finally {
            setIsLoggingOut(false);
            setAuthStatus('unauthenticated');
          }
        }, [isLoggingOut]);

        if (authStatus === 'checking') {
          return h(
            'div',
            {
              className:
                'min-h-screen flex items-center justify-center bg-neutral-950 text-neutral-400 font-sans text-sm'
            },
            'Checking authentication…'
          );
        }

        if (authStatus !== 'authenticated') {
          return h(LoginScreen, { onAuthenticated: handleAuthenticated });
        }

        return h(RepoBrowser, {
          onAuthExpired: handleAuthExpired,
          onLogout: handleLogout,
          isLoggingOut
        });
      }
