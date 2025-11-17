import React from 'react';
import { ChevronDown, Github, GitBranch, Plus, Settings, Sparkles, Trash2, RefreshCcw, Sun, Moon, X } from 'lucide-react';
import { Menu, MenuButton, MenuItems, MenuItem } from '@headlessui/react';
import { ACTION_BUTTON_CLASS } from '../../../utils/constants.js';
import { useTheme } from '../../../context/ThemeContext.js';
import type { Worktree, RepoDashboard } from '../../../types/domain.js';
import type { PlanSummary } from '../../../types/plan-mode.js';

const { createElement: h } = React;

interface RepositoryInfo {
  branches: string[];
  initCommand?: string;
}

interface RepositoryData {
  [org: string]: {
    [repo: string]: RepositoryInfo;
  };
}

interface SessionMetadata {
  idle?: boolean;
  [key: string]: any;
}

interface IdleAcknowledgement {
  lastActivityAtMs?: number;
  [key: string]: any;
}

interface RepositorySidebarProps {
  data: RepositoryData;
  collapsedOrganisations: Record<string, boolean>;
  toggleOrganisationCollapsed: (org: string) => void;
  openPromptModalForRepo: (org: string, repo: string) => void;
  openWorktreeModalForRepo: (org: string, repo: string) => void;
  openRepoSettings: (org: string, repo: string, initCommand: string) => void;
  handleWorktreeSelection: (org: string, repo: string, branch: string) => Promise<void>;
  activeWorktree: Worktree | null;
  activeRepoDashboard: RepoDashboard | null;
  sessionMetadataSnapshot: Map<string, SessionMetadata>;
  idleAcknowledgementsSnapshot: Map<string, IdleAcknowledgement>;
  isIdleAcknowledgementCurrent: (metadata: any, acknowledgement: any) => boolean;
  onConfirmDelete: (org: string, repo: string, branch: string) => void;
  onAcknowledgeIdle: (org: string, repo: string, branch: string) => void;
  onShowRepoDashboard: (org: string, repo: string) => void;
  onAddRepository: () => void;
  onCloseMobileMenu: () => void;
  logoutButton: React.ReactNode;
  plansByRepo: Record<string, PlanSummary[]>;
  activePlanId: string | null;
  onSelectPlan: (org: string, repo: string, planId: string) => void;
  onCreatePlan: (org: string, repo: string) => void;
}

export default function RepositorySidebar({
  data,
  collapsedOrganisations,
  toggleOrganisationCollapsed,
  openPromptModalForRepo,
  openWorktreeModalForRepo,
  openRepoSettings,
  handleWorktreeSelection,
  activeWorktree,
  activeRepoDashboard,
  sessionMetadataSnapshot,
  idleAcknowledgementsSnapshot,
  isIdleAcknowledgementCurrent,
  onConfirmDelete,
  onAcknowledgeIdle,
  onShowRepoDashboard,
  onAddRepository,
  onCloseMobileMenu,
  logoutButton,
  plansByRepo,
  activePlanId,
  onSelectPlan,
  onCreatePlan,
}: RepositorySidebarProps) {
  const { mode, toggle: toggleTheme } = useTheme();
  const isLightMode = mode === 'light';
  const ThemeToggleIcon = isLightMode ? Moon : Sun;
  const toggleModeLabel = isLightMode ? 'Switch to dark mode' : 'Switch to light mode';

  return h(
    'div',
    { className: 'flex h-full flex-col text-sm font-sans' },
    h(
      'div',
      { className: 'flex h-16 items-center justify-between px-3 py-3 border-b border-neutral-800 bg-neutral-925/80' },
      h(
        'div',
        { className: 'flex items-center gap-2' },
        h(
          'button',
          {
            onClick: onAddRepository,
            className:
              'inline-flex h-10 w-10 items-center justify-center rounded-md border border-neutral-800 bg-neutral-925 text-neutral-100 transition-colors hover:bg-neutral-850 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500',
            type: 'button',
            title: 'Add repository',
            'aria-label': 'Add repository',
          },
          h(Plus, { size: 18 }),
          h('span', { className: 'sr-only' }, 'Add repository'),
        ),
        logoutButton,
      h(
        'button',
        {
          onClick: toggleTheme,
          className:
            'inline-flex h-10 w-10 items-center justify-center rounded-md border border-neutral-800 bg-neutral-925 text-neutral-300 transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500',
          type: 'button',
          title: toggleModeLabel,
          'aria-label': toggleModeLabel,
            'aria-pressed': isLightMode,
        },
        h(ThemeToggleIcon, { size: 18 })
      )
      ),
      h(
        'button',
        {
          onClick: onCloseMobileMenu,
          className:
            'lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-md border border-neutral-800 bg-neutral-925 text-neutral-400 transition-colors hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500',
          type: 'button',
          title: 'Close sidebar',
          'aria-label': 'Close sidebar',
        },
        h(X, { size: 18 }),
        h('span', { className: 'sr-only' }, 'Close sidebar'),
      ),
    ),
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
                const repoKey = `${org}/${repo}`;
                const plans = plansByRepo?.[repoKey] ?? [];
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
                          Menu,
                          { as: 'div', className: 'relative' },
                          h(
                            MenuButton,
                            {
                              className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-emerald-300`,
                              title: 'Create worktree options',
                            },
                            h(Sparkles, { size: 14 }),
                          ),
                          h(
                            MenuItems,
                            {
                              className:
                                'absolute right-0 mt-2 min-w-[180px] overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 py-1 text-sm shadow-lg focus:outline-none z-10',
                            },
                            h(
                              MenuItem,
                              null,
                              ({ active }: { active: boolean }) =>
                                h(
                                  'button',
                                  {
                                    type: 'button',
                                    onClick: () => openPromptModalForRepo(org, repo),
                                    className: `block w-full px-3 py-2 text-left text-neutral-100 transition ${
                                      active ? 'bg-neutral-800' : ''
                                    }`,
                                  },
                                  'Create From Prompt',
                                ),
                            ),
                            h(
                              MenuItem,
                              null,
                              ({ active }: { active: boolean }) =>
                                h(
                                  'button',
                                  {
                                    type: 'button',
                                    onClick: () => openWorktreeModalForRepo(org, repo),
                                    className: `block w-full px-3 py-2 text-left text-neutral-100 transition ${
                                      active ? 'bg-neutral-800' : ''
                                    }`,
                                  },
                                  'Create Worktree',
                                ),
                            ),
                          ),
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
                    h(
                      'li',
                      null,
                      h(
                        'div',
                        { className: 'flex items-center justify-between px-2 py-1 text-xs uppercase tracking-wide text-neutral-500' },
                        h('span', null, 'Plans'),
                        h(
                          'button',
                          {
                            type: 'button',
                            onClick: () => onCreatePlan(org, repo),
                            className: 'text-emerald-300 hover:text-emerald-100 transition text-[11px]',
                          },
                          'New',
                        ),
                      ),
                      plans.length
                        ? h(
                            'ul',
                            { className: 'space-y-1' },
                            plans.map((plan) => {
                              const isActive = plan.id === activePlanId;
                              const badge =
                                plan.status === 'ready'
                                  ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/40'
                                  : plan.status === 'updated'
                                  ? 'text-amber-300 bg-amber-500/10 border-amber-500/40'
                                  : 'text-neutral-300 bg-neutral-800/50 border-neutral-700';
                              return h(
                                'li',
                                { key: plan.id },
                                h(
                                  'button',
                                  {
                                    type: 'button',
                                    onClick: () => onSelectPlan(org, repo, plan.id),
                                    className: [
                                      'w-full rounded-md border px-2.5 py-2 text-left text-xs transition-colors',
                                      isActive
                                        ? 'border-emerald-500/80 bg-emerald-500/10 text-emerald-100'
                                        : 'border-neutral-800 bg-neutral-925 text-neutral-100 hover:border-neutral-600',
                                    ].join(' '),
                                  },
                                  h(
                                    'div',
                                    { className: 'flex items-center justify-between gap-2' },
                                    h('span', { className: 'truncate font-medium' }, plan.title),
                                    h(
                                      'span',
                                      {
                                        className: [
                                          'inline-flex items-center rounded-full border px-1.5 py-[1px] text-[10px] font-medium',
                                          badge,
                                        ].join(' '),
                                      },
                                      plan.status === 'ready'
                                        ? 'Ready'
                                        : plan.status === 'updated'
                                        ? 'Updated'
                                        : plan.status === 'building'
                                        ? 'Building'
                                        : 'Draft',
                                    ),
                                  ),
                                ),
                              );
                            }),
                          )
                        : h(
                            'p',
                            { className: 'text-[11px] text-neutral-500 px-2 py-1' },
                            'No plans yet.',
                          ),
                    ),
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
                            onClick: () => {
                              if (branch === 'main') {
                                onShowRepoDashboard(org, repo);
                              } else {
                                handleWorktreeSelection(org, repo, branch).catch(() => {});
                              }
                            },
                          },
                          h(
                            'div',
                            { className: 'flex items-center gap-2 min-w-0 flex-1 cursor-pointer' },
                            h(GitBranch, { size: 12, className: 'flex-shrink-0' }),
                            h('span', { className: 'text-xs truncate' }, branch),
                          ),
                          branch !== 'main'
                            ? h(
                                'div',
                                { className: 'flex items-center gap-0.5 flex-shrink-0' },
                                shouldHighlightIdle
                                  ? h(
                                      'button',
                                      {
                                        type: 'button',
                                        onClick: (event: React.MouseEvent) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          onAcknowledgeIdle(org, repo, branch);
                                        },
                                        className: `${ACTION_BUTTON_CLASS} text-emerald-400 hover:text-emerald-200`,
                                        title: 'Acknowledge idle session',
                                        'aria-label': 'Acknowledge idle session',
                                      },
                                      h(RefreshCcw, { size: 11 }),
                                    )
                                  : null,
                                h(
                                  'button',
                                  {
                                    type: 'button',
                                    onClick: (event: React.MouseEvent) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      onConfirmDelete(org, repo, branch);
                                    },
                                    className: `${ACTION_BUTTON_CLASS} text-neutral-500 hover:text-rose-400`,
                                    title: 'Remove worktree',
                                    'aria-label': `Remove worktree ${branch}`,
                                  },
                                  h(Trash2, { size: 11 }),
                                ),
                              )
                            : null,
                        ),
                      );
                    }),
                  ),
                );
              }),
            )
        );
      })
    )
  );
}
