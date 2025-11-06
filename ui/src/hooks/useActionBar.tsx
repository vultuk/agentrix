/**
 * Hook for creating action bar buttons
 */

import React from 'react';
import { ScrollText, GitBranch, Server } from 'lucide-react';
import { renderSpinner } from '../components/Spinner.js';
import { TaskMenu } from '../features/tasks/components/TaskMenu.js';
import GitHubControls from '../features/github/components/GitHubControls.js';
import { ACTION_BUTTON_CLASS } from '../utils/constants.js';
import type { Worktree, RepoDashboard } from '../types/domain.js';

const { createElement: h } = React;

interface UseActionBarOptions {
  activeWorktree: Worktree | null;
  activeRepoDashboard: RepoDashboard | null;
  tasks: any[];
  hasRunningTasks: boolean;
  planModalOpen: boolean;
  planModalLoading: boolean;
  isGitSidebarOpen: boolean;
  isPortsSidebarOpen: boolean;
  onOpenPlanHistory: () => void;
  onToggleGitSidebar: () => void;
  onTogglePortsSidebar: () => void;
}

export function useActionBar({
  activeWorktree,
  activeRepoDashboard,
  tasks,
  hasRunningTasks,
  planModalOpen,
  planModalLoading,
  isGitSidebarOpen,
  isPortsSidebarOpen,
  onOpenPlanHistory,
  onToggleGitSidebar,
  onTogglePortsSidebar,
}: UseActionBarOptions) {
  const githubRepoContext = activeWorktree || activeRepoDashboard;

  const githubControls = githubRepoContext
    ? h(GitHubControls, {
        org: githubRepoContext.org,
        repo: githubRepoContext.repo,
      })
    : null;

  const taskMenuButton = h(TaskMenu, {
    tasks,
    hasRunning: hasRunningTasks,
  });

  const planHistoryButton = activeWorktree
    ? h(
        'button',
        {
          type: 'button',
          onClick: onOpenPlanHistory,
          className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`,
          title: 'View saved plans',
        },
        planModalOpen && planModalLoading
          ? renderSpinner('text-neutral-100')
          : h(ScrollText, { size: 16 })
      )
    : null;

  const gitSidebarButton = activeWorktree
    ? h(
        'button',
        {
          type: 'button',
          onClick: onToggleGitSidebar,
          className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`,
          'aria-pressed': isGitSidebarOpen ? 'true' : 'false',
          'aria-expanded': isGitSidebarOpen ? 'true' : 'false',
          title: isGitSidebarOpen ? 'Hide Git status sidebar' : 'Show Git status sidebar'
        },
        h(GitBranch, { size: 16 })
      )
    : null;

  const portsSidebarButton = activeWorktree
    ? h(
        'button',
        {
          type: 'button',
          onClick: onTogglePortsSidebar,
          className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`,
          'aria-pressed': isPortsSidebarOpen ? 'true' : 'false',
          'aria-expanded': isPortsSidebarOpen ? 'true' : 'false',
          title: isPortsSidebarOpen ? 'Hide ports sidebar' : 'Show ports sidebar',
        },
        h(Server, { size: 16 })
      )
    : null;

  return {
    githubControls,
    taskMenuButton,
    planHistoryButton,
    gitSidebarButton,
    portsSidebarButton,
  };
}
