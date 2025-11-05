import React from 'react';
import { Menu, RefreshCcw } from 'lucide-react';
import { renderSpinner } from './common/Spinner.js';
import GitStatusSidebar from './GitStatusSidebar.js';
import RepositoryDashboard from './RepositoryDashboard.js';
import { REPOSITORY_POLL_INTERVAL_MS, ACTION_BUTTON_CLASS } from '../config/constants.js';

const { createElement: h } = React;

interface Worktree {
  org: string;
  repo: string;
  branch: string;
}

interface MainPaneProps {
  activeWorktree: Worktree | null;
  activeRepoDashboard: { org: string; repo: string } | null;
  dashboardData: any;
  isDashboardLoading: boolean;
  dashboardError: string | null;
  terminalContainerRef: React.RefObject<HTMLDivElement | null>;
  isGitSidebarOpen: boolean;
  githubControls: React.ReactNode;
  taskMenuButton: React.ReactNode;
  planHistoryButton: React.ReactNode;
  gitSidebarButton: React.ReactNode;
  registerMobileMenuButton: (node: HTMLButtonElement | null) => void;
  onMobileMenuOpen: () => void;
  onDashboardRefresh: () => void;
  onGitSidebarClose: () => void;
  onAuthExpired: () => void;
  onGitStatusUpdate: (snapshot: any) => void;
  onOpenDiff: (params: { item: any }) => void;
  onCreateIssuePlan: (issue: any, repoInfo: { org: string; repo: string }) => void;
}

export default function MainPane({
  activeWorktree,
  activeRepoDashboard,
  dashboardData,
  isDashboardLoading,
  dashboardError,
  terminalContainerRef,
  isGitSidebarOpen,
  githubControls,
  taskMenuButton,
  planHistoryButton,
  gitSidebarButton,
  registerMobileMenuButton,
  onMobileMenuOpen,
  onDashboardRefresh,
  onGitSidebarClose,
  onAuthExpired,
  onGitStatusUpdate,
  onOpenDiff,
  onCreateIssuePlan,
}: MainPaneProps) {
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
          { className: 'min-w-0' },
          h(
            'div',
            {
              className: 'text-xs text-neutral-500 truncate',
              title: `${activeWorktree.org}/${activeWorktree.repo}`,
            },
            `${activeWorktree.org}/${activeWorktree.repo}`,
          ),
          h(
            'div',
            { className: 'text-sm text-neutral-300 flex items-center gap-2 min-w-0' },
            h(
              'span',
              {
                className: 'block truncate',
                title: activeWorktree.branch,
              },
              activeWorktree.branch,
            ),
          ),
        ),
        h(
          'div',
          { className: 'flex items-center gap-2 flex-shrink-0' },
          githubControls,
          taskMenuButton,
          planHistoryButton,
          gitSidebarButton,
          h(
            'button',
            {
              type: 'button',
              ref: registerMobileMenuButton,
              onClick: onMobileMenuOpen,
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
          onClose: onGitSidebarClose,
          onAuthExpired: onAuthExpired,
          onStatusUpdate: onGitStatusUpdate,
          onOpenDiff: onOpenDiff,
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
              onClick: onDashboardRefresh,
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
              ref: registerMobileMenuButton,
              onClick: onMobileMenuOpen,
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
        h(RepositoryDashboard as any, {
          repository: activeRepoDashboard,
          data: dashboardData,
          loading: isDashboardLoading,
          error: dashboardError,
          onCreateIssuePlan: onCreateIssuePlan,
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
            ref: registerMobileMenuButton,
            onClick: onMobileMenuOpen,
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

  return h(
    'div',
    { className: 'flex-1 bg-neutral-950 text-neutral-100 font-sans flex flex-col min-h-0' },
    mainPaneContent,
  );
}

