import React from 'react';
import { ScrollText, GitBranch } from 'lucide-react';
import { renderSpinner } from './common/Spinner.js';
import { TaskMenu } from './tasks/TaskMenu.js';
import GitHubControls from './GitHubControls.js';
import { ACTION_BUTTON_CLASS } from '../config/constants.js';

const { createElement: h } = React;

interface Worktree {
  org: string;
  repo: string;
  branch: string;
}

interface ActionBarProps {
  activeWorktree: Worktree | null;
  activeRepoDashboard: { org: string; repo: string } | null;
  tasks: any[];
  isTaskMenuOpen: boolean;
  hasRunningTasks: boolean;
  taskMenuRef: React.RefObject<HTMLDivElement | null>;
  planModalOpen: boolean;
  planModalLoading: boolean;
  isGitSidebarOpen: boolean;
  onToggleTaskMenu: () => void;
  onOpenPlanHistory: () => void;
  onToggleGitSidebar: () => void;
}

export default function ActionBar({
  activeWorktree,
  activeRepoDashboard,
  tasks,
  isTaskMenuOpen,
  hasRunningTasks,
  taskMenuRef,
  planModalOpen,
  planModalLoading,
  isGitSidebarOpen,
  onToggleTaskMenu,
  onOpenPlanHistory,
  onToggleGitSidebar,
}: ActionBarProps) {
  const githubRepoContext = activeWorktree || activeRepoDashboard;

  const githubControls = githubRepoContext
    ? h(GitHubControls, {
        org: githubRepoContext.org,
        repo: githubRepoContext.repo,
      })
    : null;

  const taskMenuButton = h(TaskMenu, {
    tasks,
    isOpen: isTaskMenuOpen,
    onToggle: onToggleTaskMenu,
    hasRunning: hasRunningTasks,
    menuRef: taskMenuRef,
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

  return {
    githubControls,
    taskMenuButton,
    planHistoryButton,
    gitSidebarButton,
  };
}

