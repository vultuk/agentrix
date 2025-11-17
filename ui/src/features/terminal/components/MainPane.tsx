import React from 'react';
import { Menu, RefreshCcw } from 'lucide-react';
import { renderSpinner } from '../../../components/Spinner.js';
import GitStatusSidebar from '../../github/components/GitStatusSidebar.js';
import RepositoryDashboard from '../../repositories/components/RepositoryDashboard.js';
import { REPOSITORY_POLL_INTERVAL_MS, ACTION_BUTTON_CLASS } from '../../../utils/constants.js';
import TabbedTerminalPanel from './TabbedTerminalPanel.js';
import PlanWorkspace from '../../plans/components/PlanWorkspace.js';
import type { Worktree, RepoDashboard, WorktreeSessionTab } from '../../../types/domain.js';
import type { PlanDetail } from '../../../types/plan-mode.js';
import type { CodexSdkEvent, CodexSdkSessionMetadata } from '../../../types/codex-sdk.js';

const { createElement: h } = React;

interface MainPaneProps {
  activeWorktree: Worktree | null;
  activeRepoDashboard: RepoDashboard | null;
  dashboardData: any;
  isDashboardLoading: boolean;
  dashboardError: string | null;
  terminalContainerRef: React.RefObject<HTMLDivElement | null>;
  terminalSessions: WorktreeSessionTab[];
  activeSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onSessionClose: (sessionId: string) => void;
  onSessionCreate: () => void;
  onQuickLaunchSession?: (tool: 'terminal' | 'agent') => void;
  isSessionCreationPending: boolean;
  isQuickSessionPending?: boolean;
  pendingCloseSessionId: string | null;
  isGitSidebarOpen: boolean;
  githubControls: React.ReactNode;
  taskMenuButton: React.ReactNode;
  portsMenuButton: React.ReactNode;
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
  nonClosableSessionIds?: Set<string>;
  renderSessionContent?: (sessionId: string | null) => React.ReactNode;
  activePlan: PlanDetail | null;
  isPlanWorkspaceLoading: boolean;
  planWorkspaceError: string | null;
  onDeletePlan: () => void;
  onSavePlan: (markdown: string) => void;
  onMarkPlanReady: () => void;
  onBuildPlan: () => void;
  isPlanBuildPending: boolean;
  planChatState: {
    events: CodexSdkEvent[];
    isSending: boolean;
    connectionState: 'idle' | 'connecting' | 'connected' | 'disconnected';
    session: CodexSdkSessionMetadata | null;
    lastError: string | null;
    onSend: (text: string) => Promise<void>;
  };
}

export default function MainPane({
  activeWorktree,
  activeRepoDashboard,
  dashboardData,
  isDashboardLoading,
  dashboardError,
  terminalContainerRef,
  terminalSessions,
  activeSessionId,
  onSessionSelect,
  onSessionClose,
  onSessionCreate,
  onQuickLaunchSession,
  isSessionCreationPending,
  isQuickSessionPending = false,
  pendingCloseSessionId,
  isGitSidebarOpen,
  githubControls,
  taskMenuButton,
  portsMenuButton,
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
  nonClosableSessionIds,
  renderSessionContent,
  activePlan,
  isPlanWorkspaceLoading,
  planWorkspaceError,
  onDeletePlan,
  onSavePlan,
  onMarkPlanReady,
  onBuildPlan,
  isPlanBuildPending,
  planChatState,
}: MainPaneProps) {
  let mainPaneContent = null;

  if (activePlan) {
    mainPaneContent = h(
      'div',
      {
        className:
          'box-border bg-neutral-925 border border-neutral-800 h-full flex flex-col overflow-hidden min-h-0 flex-1 p-4',
      },
      h(PlanWorkspace, {
        plan: activePlan,
        isLoading: isPlanWorkspaceLoading,
        error: planWorkspaceError,
        chatState: planChatState,
        onSave: onSavePlan,
        onMarkReady: onMarkPlanReady,
        onBuild: onBuildPlan,
        isBuildPending: isPlanBuildPending,
        onDeletePlan,
      }),
    );
  } else if (activeWorktree) {
    mainPaneContent = h(
      'div',
      {
        className:
          'box-border bg-neutral-925 border border-neutral-800 h-full flex flex-col overflow-hidden min-h-0 flex-1',
      },
      h(
        'div',
        { className: 'flex h-16 items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-925/80' },
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
          { className: 'flex flex-wrap items-center justify-end gap-2 flex-shrink-0' },
          githubControls,
          taskMenuButton,
          portsMenuButton,
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
          h(
            'div',
            { className: 'flex-1 flex flex-col min-w-0' },
            h(TabbedTerminalPanel, {
              terminalContainerRef,
              sessions: terminalSessions,
              activeSessionId,
              pendingCloseSessionId,
              isAddDisabled: isSessionCreationPending,
              onSelectSession: onSessionSelect,
              onCloseSession: onSessionClose,
              onAddSession: onSessionCreate,
              onQuickLaunchSession,
              isQuickLaunchPending: isQuickSessionPending,
              nonClosableSessionIds,
              renderSessionContent,
            }),
          ),
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
          'box-border bg-neutral-925 border border-neutral-800 h-full flex flex-col overflow-hidden min-h-0 flex-1',
      },
      h(
        'div',
        { className: 'flex h-16 items-center justify-between px-4 py-3 border-b border-neutral-800 bg-neutral-925/80' },
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
          { className: 'flex flex-wrap items-center gap-2 justify-end' },
          githubControls,
          taskMenuButton,
          portsMenuButton,
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
          'box-border bg-neutral-925 border border-neutral-800 h-full flex flex-col overflow-hidden min-h-0',
      },
      h(
        'div',
        { className: 'flex h-16 items-center justify-end gap-2 flex-wrap px-4 py-3 border-b border-neutral-800 bg-neutral-925/80' },
        portsMenuButton,
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
