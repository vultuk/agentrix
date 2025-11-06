import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import 'xterm/css/xterm.css';
import { LogOut } from 'lucide-react';
import LoadingButton from '../../../components/LoadingButton.js';
import { ISSUE_PLAN_PROMPT_TEMPLATE } from '../../../config/commands.js';
import { REPOSITORY_POLL_INTERVAL_MS, SESSION_POLL_INTERVAL_MS } from '../../../utils/constants.js';
import { renderSpinner } from '../../../components/Spinner.js';
import { isIdleAcknowledgementCurrent, getMetadataLastActivityMs, createIdleAcknowledgementEntry } from '../../../utils/activity.js';
import { useRepoBrowserModals } from '../hooks/useRepoBrowserModals.js';
import { useRepoBrowserState } from '../hooks/useRepoBrowserState.js';
import { useTerminalManagement } from '../../terminal/hooks/useTerminalManagement.js';
import { useSessionManagement } from '../../terminal/hooks/useSessionManagement.js';
import { useGitSidebar } from '../../github/hooks/useGitSidebar.js';
import { useTaskManagement } from '../../tasks/hooks/useTaskManagement.js';
import { usePendingTaskProcessor } from '../../tasks/hooks/usePendingTaskProcessor.js';
import { useRepositoryData } from '../hooks/useRepositoryData.js';
import { useDashboard } from '../../github/hooks/useDashboard.js';
import { useEventStream } from '../../../hooks/useEventStream.js';
import { useCommandConfig } from '../../../hooks/useCommandConfig.js';
import { useRepositoryOperations } from '../hooks/useRepositoryOperations.js';
import { useWorktreeOperations } from '../../worktrees/hooks/useWorktreeOperations.js';
import { usePlanManagement } from '../../plans/hooks/usePlanManagement.js';
import { useDiffManagement } from '../../github/hooks/useDiffManagement.js';
import { usePollingEffects } from '../../../hooks/usePollingEffects.js';
import { useWorktreeSelection } from '../../worktrees/hooks/useWorktreeSelection.js';
import { useMenuManagement } from '../../../hooks/useMenuManagement.js';
import { useActionBar } from '../../../hooks/useActionBar.js';
import MainPane from '../../terminal/components/MainPane.js';
import Sidebar from './Sidebar.js';
import ModalContainer from '../../terminal/components/ModalContainer.js';
import type { Worktree } from '../../../types/domain.js';

const { createElement: h } = React;

interface RepoBrowserProps {
  onAuthExpired?: () => void;
  onLogout?: () => void;
  isLoggingOut?: boolean;
}

export default function RepoBrowser({ onAuthExpired, onLogout, isLoggingOut }: RepoBrowserProps = {}) {
  // Use centralized UI state management
  const browserState = useRepoBrowserState();
  const {
    width,
    setWidth,
    isRealtimeConnected,
    setIsRealtimeConnected,
    pendingWorktreeAction,
    setPendingWorktreeAction,
    pendingActionLoading,
    setPendingActionLoading,
    collapsedOrganisations,
    toggleOrganisationCollapsed,
    getWorktreeKey,
  } = browserState;
  
  const pendingTaskProcessorRef = useRef<((task: any, pending: any) => void) | null>(null);
  
  // Mobile menu ref
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const registerMobileMenuButton = useCallback((node: HTMLButtonElement | null) => {
    mobileMenuButtonRef.current = node;
  }, []);
  
  // Use menu management hook
  const menus = useMenuManagement({ mobileMenuButtonRef });
  
  // Use session management hook
  const sessions = useSessionManagement();
  
  // Use terminal management hook
  const terminal = useTerminalManagement({ 
    onAuthExpired: onAuthExpired,
    onSessionRemoved: sessions.removeTrackedSession
  });
  
  // Use dashboard hook first (needed by repo data hook)
  const dashboard = useDashboard({ onAuthExpired });
  
  // Use repository data hook
  const repoData = useRepositoryData({
    onAuthExpired,
    onSessionRemoved: sessions.removeTrackedSession,
    sessionMapRef: terminal.sessionMapRef,
    sessionKeyByIdRef: terminal.sessionKeyByIdRef,
    isRealtimeConnected,
    setActiveRepoDashboard: dashboard.setActiveRepoDashboard,
  });
  
  const handleTaskComplete = useCallback((task: any, pending: any) => {
    // handleTaskComplete relies on pendingTaskProcessorRef being assigned later in the render cycle.
    // The ref indirection avoids dependency churn while preserving a stable callback signature.
    pendingTaskProcessorRef.current?.(task, pending);
  }, []);
  
  // Use task management hook
  const taskMgmt = useTaskManagement({ onAuthExpired, onTaskComplete: handleTaskComplete });
  
  // Use Git sidebar hook
  const gitSidebar = useGitSidebar(repoData.activeWorktree, getWorktreeKey);
  
  // Use command config hook
  const commandCfg = useCommandConfig({ onAuthExpired });
  
  // Use repository operations hook
  const repoOps = useRepositoryOperations({ 
    onAuthExpired,
    onDataUpdate: repoData.applyDataUpdate,
  });
  
  // Use worktree operations hook
  const worktreeOps = useWorktreeOperations({
    onAuthExpired,
    onDataUpdate: repoData.applyDataUpdate,
  });
  
  // Use plan management hook
  const planMgmt = usePlanManagement({ onAuthExpired });
  
  // Use diff management hook
  const {
    autoCloseDiff,
    closeDiffModal,
    openGitDiff,
    toggleDiffView: toggleDiffViewInternal,
  } = useDiffManagement({ activeWorktree: repoData.activeWorktree, onAuthExpired });
  
  // Destructure hook values for easier reference
  const terminalContainerRef = terminal.terminalContainerRef;
  const sessionId = terminal.sessionId;
  const sessionMapRef = terminal.sessionMapRef;
  const sessionKeyByIdRef = terminal.sessionKeyByIdRef;
  const openTerminalForWorktree = terminal.openTerminal;
  const disposeSocket = terminal.disposeSocket;
  const disposeTerminal = terminal.disposeTerminal;
  const sendResize = terminal.sendResize;
  
  const data = repoData.data;
  const activeWorktree = repoData.activeWorktree;
  const setActiveWorktree = repoData.setActiveWorktree;
  const activeRepoDashboard = dashboard.activeRepoDashboard;
  const setActiveRepoDashboard = dashboard.setActiveRepoDashboard;
  const dashboardData = dashboard.dashboardData;
  const dashboardError = dashboard.dashboardError;
  const isDashboardLoading = dashboard.isDashboardLoading;
  const clearDashboardPolling = dashboard.clearDashboardPolling;
  
  const tasks = taskMgmt.tasks;
  const pendingLaunchesRef = taskMgmt.pendingLaunchesRef;
  
  const knownSessionsRef = sessions.knownSessionsRef;
  const sessionMetadataSnapshot = sessions.sessionMetadataSnapshot;
  const idleAcknowledgementsSnapshot = sessions.idleAcknowledgementsSnapshot;
  
  const hasRunningTasks = useMemo(
    () => tasks.some((task) => task && (task.status === 'pending' || task.status === 'running')),
    [tasks],
  );
  
  // Use modal management hook
  const modals = useRepoBrowserModals();

  const openRepoSettings = (org: string, repo: string, initCommandValue: string = '') => {
    if (!org || !repo) {
      return;
    }
    modals.openEditRepoSettings(org, repo, initCommandValue);
  };

  const openPromptModalForRepo = useCallback((org: string, repo: string) => {
    if (!org || !repo) {
      return;
    }
    modals.openPromptModal(org, repo);
    menus.setIsMobileMenuOpen(false);
  }, [modals, menus]);

  const openWorktreeModalForRepo = useCallback((org: string, repo: string) => {
    if (!org || !repo) {
      return;
    }
    modals.openWorktreeModal(org, repo);
    menus.setIsMobileMenuOpen(false);
  }, [modals, menus]);


  const reopenRepoSettingsAfterConfirm = (dialogState: { org: string; repo: string; reopenSettings?: boolean; initCommandDraft?: string } | null) => {
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
        : repoData.getRepoInitCommandValue(dialogState.org, dialogState.repo);
    modals.openEditRepoSettings(dialogState.org, dialogState.repo, draftValue);
  };


  const activeWorktreeRef = useRef<Worktree | null>(null);

  const getCommandForLaunch = commandCfg.getCommandForLaunch;

  useEffect(() => {
    activeWorktreeRef.current = activeWorktree;
  }, [activeWorktree]);

  const notifyAuthExpired = useCallback(() => {
    if (typeof onAuthExpired === 'function') {
      onAuthExpired();
    }
  }, [onAuthExpired]);

  const createPlanFromPrompt = useCallback(
    async (
      promptValue: string,
      org: string,
      repo: string,
      options: {
        restorePromptOnError?: boolean;
        rawPrompt?: boolean;
        dangerousMode?: boolean;
      } = {},
    ) => {
      await planMgmt.createPlanFromPrompt(promptValue, org, repo, {
        ...options,
        onPromptChange: modals.setPromptText,
      });
    },
    [planMgmt, modals],
  );

  const openIssuePlanModal = useCallback(
    (issue: any, repoInfo: { org: string; repo: string }) => {
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
      modals.setSelectedRepo([org, repo]);
      modals.setPromptText(promptValue);
      modals.setPromptInputMode('edit');
      modals.setShowPromptWorktreeModal(true);
      menus.setIsMobileMenuOpen(false);
      const schedule =
        typeof queueMicrotask === 'function'
          ? queueMicrotask
          : (callback: () => void) => {
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
      modals,
      menus,
      createPlanFromPrompt,
    ],
  );

  const handleClosePlanModal = useCallback(() => {
    modals.closePlanModal();
  }, [modals]);

  const fetchPlanContent = useCallback(
    async (context: { org: string; repo: string; branch: string }, planId: string) => {
      await planMgmt.fetchPlanContent(context, planId, modals.setPlanModal);
    },
    [planMgmt, modals]
  );

  const openPlanHistory = useCallback(async () => {
    await planMgmt.openPlanHistory(activeWorktree, modals.setPlanModal, fetchPlanContent);
  }, [activeWorktree, planMgmt, modals, fetchPlanContent]);

  const handleSelectPlan = useCallback(
    (planId: string) => {
      if (!planId || !modals.planModal.context || !modals.planModal.context.branch) {
        return;
      }
      fetchPlanContent(modals.planModal.context as { org: string; repo: string; branch: string }, planId);
    },
    [fetchPlanContent, modals.planModal.context]
  );

  const setGitDiffModal = modals.setGitDiffModal;

  useEffect(() => {
    autoCloseDiff(setGitDiffModal);
  }, [autoCloseDiff, setGitDiffModal, activeWorktree?.org, activeWorktree?.repo, activeWorktree?.branch]);

  const handleCloseGitDiff = useCallback(() => {
    closeDiffModal(setGitDiffModal);
  }, [closeDiffModal, setGitDiffModal]);

  const handleOpenGitDiff = useCallback(
    ({ item }: { item: any }) => {
      openGitDiff(item, setGitDiffModal);
    },
    [openGitDiff, setGitDiffModal],
  );

  const toggleDiffView = useCallback(() => {
    toggleDiffViewInternal(setGitDiffModal);
  }, [toggleDiffViewInternal, setGitDiffModal]);

  const openTerminalForWorktreeRef = useRef<((worktree: Worktree, options?: any) => Promise<any>) | null>(null);
  
  const { processPendingTask: processPendingWorktree } = usePendingTaskProcessor({
    getWorktreeKey,
    getCommandForLaunch,
    sessionMapRef,
    knownSessionsRef,
    openTerminalForWorktreeRef,
    activeWorktreeRef,
    clearDashboardPolling,
    setActiveRepoDashboard,
    setDashboardError: dashboard.setDashboardError,
    setIsDashboardLoading: dashboard.setIsDashboardLoading,
    setActiveWorktree,
    setPendingWorktreeAction,
    setIsMobileMenuOpen: menus.setIsMobileMenuOpen,
    closePromptModal: modals.closePromptModal,
    closeWorktreeModal: modals.closeWorktreeModal,
    pendingLaunchesRef,
  });
  useEffect(() => {
    pendingTaskProcessorRef.current = (task: any, pending: any) => {
      processPendingWorktree(task, pending);
    };
    return () => {
      pendingTaskProcessorRef.current = null;
    };
  }, [processPendingWorktree]);
  
  // Destructure Git sidebar values
  const isGitSidebarOpen = gitSidebar.isGitSidebarOpen;
  const handleGitStatusUpdate = gitSidebar.handleGitStatusUpdate;
  const toggleGitSidebar = gitSidebar.toggleGitSidebar;
  const closeGitSidebar = gitSidebar.closeGitSidebar;
  
  // Destructure session management values
  const syncKnownSessions = sessions.syncKnownSessions;

  // Use polling effects hook (must be before hooks that depend on it)
  const polling = usePollingEffects({
    isRealtimeConnected,
    repositoryPollInterval: REPOSITORY_POLL_INTERVAL_MS,
    sessionPollInterval: SESSION_POLL_INTERVAL_MS,
    onAuthExpired,
    onDataUpdate: repoData.applyDataUpdate,
    onSessionsUpdate: syncKnownSessions,
    onTasksLoad: taskMgmt.loadTasks,
  });
  
  // Use worktree selection hook
  const worktreeSelection = useWorktreeSelection({
    getWorktreeKey,
    sessionMapRef: terminal.sessionMapRef,
    knownSessionsRef: sessions.knownSessionsRef,
    sessionMetadataRef: sessions.sessionMetadataRef,
    idleAcknowledgementsRef: sessions.idleAcknowledgementsRef,
    dashboardCacheRef: dashboard.dashboardCacheRef,
    clearDashboardPolling: dashboard.clearDashboardPolling,
    setPendingWorktreeAction,
    setActiveWorktree: repoData.setActiveWorktree,
    setActiveRepoDashboard: dashboard.setActiveRepoDashboard,
    setDashboardData: dashboard.setDashboardData,
    setDashboardError: dashboard.setDashboardError,
    setIsDashboardLoading: dashboard.setIsDashboardLoading,
    setIdleAcknowledgementsSnapshot: sessions.setIdleAcknowledgementsSnapshot,
    setIsMobileMenuOpen: menus.setIsMobileMenuOpen,
    disposeSocket: terminal.disposeSocket,
    disposeTerminal: terminal.disposeTerminal,
    closeGitSidebar: gitSidebar.closeGitSidebar,
    loadSessions: polling.loadSessions,
    openTerminalForWorktree: terminal.openTerminal,
  });


  // Sync openTerminalForWorktree function to ref for use in other callbacks
  useEffect(() => {
    openTerminalForWorktreeRef.current = ((worktree: Worktree | null, options?: { command?: string; prompt?: string }) => {
      return openTerminalForWorktree(worktree, options || {}) as any;
    }) as any;
  }, [openTerminalForWorktree]);
  
  // Resize effects for terminal
  useEffect(() => {
    requestAnimationFrame(() => {
      sendResize();
    });
    const timeout = setTimeout(() => {
      sendResize();
    }, 200);
    return () => clearTimeout(timeout);
  }, [width, menus.isMobileMenuOpen, sessionId, isGitSidebarOpen, sendResize]);

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
  }, [sendResize]);

  const applyTaskUpdate = taskMgmt.applyTaskUpdate;

  // Set up event stream for real-time updates
  useEventStream({
    onRepos: (payload: any) => {
      const reposData = payload && typeof payload === 'object' ? payload.data : null;
      if (reposData) {
        repoData.applyDataUpdate(reposData);
      }
    },
    onSessions: (payload: any) => {
      const sessions = payload && typeof payload === 'object' ? payload.sessions : null;
      if (sessions) {
        syncKnownSessions(sessions);
      }
    },
    onTasks: (payload: any) => {
      applyTaskUpdate(payload);
    },
    onConnect: () => {
      setIsRealtimeConnected(true);
    },
    onDisconnect: () => {
      setIsRealtimeConnected(false);
    },
  });

  const handleAddRepo = async () => {
    if (repoOps.isAddingRepo) {
      return;
    }
    const trimmed = modals.repoUrl.trim();
    if (!trimmed) {
      window.alert('Please enter a repository URL.');
      return;
    }
    const initCommandPayload = modals.repoInitCommand.trim();
    try {
      const result = await repoOps.addRepository(trimmed, initCommandPayload);
      const info = result.repo;
      if (info && info.org && info.repo) {
        const repoInfo = data?.[info.org]?.[info.repo] || {};
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
          menus.setIsMobileMenuOpen(false);
        } else {
          setActiveWorktree(null);
        }
      }
      modals.setRepoUrl('');
      modals.setRepoInitCommand('');
      modals.setShowAddRepoModal(false);
    } catch (error: any) {
      // Error already handled by hook
    }
  };

  const closeEditInitCommandModal = useCallback(() => {
    modals.closeEditRepoSettings();
  }, [modals]);

  const requestRepoDeletionFromSettings = useCallback(() => {
    if (modals.editInitCommandModal.saving || repoOps.isDeletingRepo) {
      return;
    }
    const { org, repo, value } = modals.editInitCommandModal;
    if (!org || !repo) {
      return;
    }
    modals.setConfirmDeleteRepo({
      org,
      repo,
      reopenSettings: true,
      initCommandDraft: value,
    });
    modals.closeEditRepoSettings();
  }, [modals, repoOps.isDeletingRepo]);

  const handleSaveInitCommand = useCallback(async () => {
    const state = modals.editInitCommandModal;
    if (!state.open || state.saving || !state.org || !state.repo) {
      return;
    }
    modals.setEditInitCommandModal((current) => ({ ...current, saving: true, error: null }));
    try {
      await repoOps.updateInitCommand(state.org, state.repo, state.value);
      modals.closeEditRepoSettings();
    } catch (error: any) {
      modals.setEditInitCommandModal((current) => ({
        ...current,
        saving: false,
        error: (error as any)?.message || 'Failed to update init command.',
      }));
    }
  }, [repoOps, modals]);

  const handleConfirmDeleteRepo = async () => {
    if (repoOps.isDeletingRepo || !modals.confirmDeleteRepo) {
      return;
    }
    const { org, repo } = modals.confirmDeleteRepo;
    await repoOps.deleteRepository(org, repo, () => {
      // Cleanup logic
      sessionMapRef.current.forEach((session: string, key: string) => {
        const [orgKey, repoKey] = key.split('::');
        if (orgKey === org && repoKey === repo) {
          sessionMapRef.current.delete(key);
          sessionKeyByIdRef.current.delete(session);
          sessions.removeTrackedSession(key);
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
      }
      dashboard.dashboardCacheRef.current.delete(`${org}::${repo}`);
      if (
        activeRepoDashboard &&
        activeRepoDashboard.org === org &&
        activeRepoDashboard.repo === repo
      ) {
        clearDashboardPolling();
        setActiveRepoDashboard(null);
        dashboard.setDashboardData(null);
        dashboard.setDashboardError(null);
        dashboard.setIsDashboardLoading(false);
      }
      modals.setConfirmDeleteRepo(null);
    });
  };

  const handleCreateWorktree = async () => {
    if (worktreeOps.isCreatingWorktree) {
      return;
    }
    if (!modals.selectedRepo) return;
    const trimmedBranch = modals.branchName.trim();
    if (!trimmedBranch) return;
    const [org, repo] = modals.selectedRepo;
    try {
      const result = await worktreeOps.createWorktree(org, repo, trimmedBranch, null);
      const taskId = result.taskId;
      if (!taskId) {
        throw new Error('Server did not return a task identifier.');
      }
      pendingLaunchesRef.current.set(taskId, {
        kind: 'manual',
        org,
        repo,
        requestedBranch: trimmedBranch,
        launchOption: modals.worktreeLaunchOption,
        dangerousMode: modals.launchDangerousMode,
      });
      modals.closeWorktreeModal();
      menus.setIsMobileMenuOpen(false);
    } catch (error: any) {
      // Error already handled by hook
    }
  };

  const handleCreatePlan = () => {
    if (!modals.selectedRepo) {
      window.alert('Select a repository before creating a plan.');
      return;
    }
    const [org, repo] = modals.selectedRepo;
    void createPlanFromPrompt(modals.promptText, org, repo);
  };

  const handleCreateWorktreeFromPrompt = async () => {
    if (worktreeOps.isCreatingPromptWorktree) {
      return;
    }
    if (!modals.selectedRepo) {
      return;
    }
    if (!modals.promptText.trim()) {
      window.alert('Please enter a prompt.');
      return;
    }

    const command = getCommandForLaunch(modals.promptAgent, modals.promptDangerousMode);
    if (!command) {
      window.alert('Selected agent command is not configured.');
      return;
    }

    const [org, repo] = modals.selectedRepo;
    const promptValue = modals.promptText;
    try {
      const result = await worktreeOps.createWorktree(org, repo, null, promptValue);
      const taskId = result.taskId;
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
        launchOption: modals.promptAgent,
        dangerousMode: modals.promptDangerousMode,
      });
      modals.closePromptModal();
      menus.setIsMobileMenuOpen(false);
    } catch (error: any) {
      // Error already handled by hook
    }
  };

  const handleConfirmDelete = async () => {
    if (worktreeOps.isDeletingWorktree || !modals.confirmDelete) {
      return;
    }
    const { org, repo, branch } = modals.confirmDelete;
    await worktreeOps.deleteWorktree(org, repo, branch);
    
    // Cleanup logic
    const key = getWorktreeKey(org, repo, branch);
    const session = sessionMapRef.current.get(key);
    if (session) {
      sessionMapRef.current.delete(key);
      sessionKeyByIdRef.current.delete(session);
    }
    sessions.removeTrackedSession(key);
    if (
      activeWorktree &&
      activeWorktree.org === org &&
      activeWorktree.repo === repo &&
      activeWorktree.branch === branch
    ) {
      setActiveWorktree(null);
    }
    modals.setConfirmDelete(null);
  };

  const handleWorktreeAction = useCallback(async (action: string) => {
    if (!pendingWorktreeAction || pendingActionLoading) {
      return;
    }
    setPendingActionLoading(action);
    clearDashboardPolling();
    setActiveRepoDashboard(null);
    dashboard.setDashboardError(null);
    dashboard.setIsDashboardLoading(false);
    const worktree = pendingWorktreeAction;
    const isDangerous = action.endsWith('-dangerous');
    const resolvedAction = isDangerous ? action.replace(/-dangerous$/, '') : action;
    const command = getCommandForLaunch(resolvedAction, isDangerous);
    setActiveWorktree(worktree);
    try {
      await openTerminalForWorktree(worktree, command ? { command } : {});
      setPendingWorktreeAction(null);
    } catch (error: any) {
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
    menus,
    getCommandForLaunch,
  ]);

  const handleDashboardRefresh = useCallback(() => {
    dashboard.refreshDashboard();
  }, [dashboard]);

  const showDangerousModeOption =
    modals.worktreeLaunchOption === 'codex' || modals.worktreeLaunchOption === 'claude';
  const isLaunchOptionDisabled = !modals.branchName.trim();
  const dangerousModeCheckboxId = 'worktree-dangerous-mode';
  const showPromptDangerousModeOption = modals.promptAgent === 'codex' || modals.promptAgent === 'claude';
  const isPromptLaunchOptionDisabled = !modals.promptText.trim();

  const logoutButton =
    typeof onLogout === 'function'
      ? h(
          'button',
          {
            type: 'button',
            onClick: onLogout,
            disabled: Boolean(isLoggingOut),
            'aria-label': 'Log out',
            'aria-busy': Boolean(isLoggingOut) ? ('true' as const) : undefined,
            className:
              'inline-flex h-10 w-10 items-center justify-center rounded-md border border-neutral-800 bg-neutral-925 text-neutral-300 transition-colors hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-500 disabled:cursor-not-allowed disabled:opacity-70',
          },
          isLoggingOut
            ? h(
                Fragment,
                null,
                renderSpinner('text-neutral-200'),
                h('span', { className: 'sr-only' }, 'Logging out')
              )
            : h(
                Fragment,
                null,
                h(LogOut, { size: 18 }),
                h('span', { className: 'sr-only' }, 'Log out')
              )
        )
      : null;

  // Action bar with GitHub controls and action buttons
  const actionButtons = useActionBar({
    activeWorktree,
    activeRepoDashboard,
    tasks,
    hasRunningTasks,
    planModalOpen: modals.planModal.open,
    planModalLoading: modals.planModal.loading,
    isGitSidebarOpen,
    onOpenPlanHistory: openPlanHistory,
    onToggleGitSidebar: toggleGitSidebar,
  });

  const githubControls = actionButtons.githubControls;
  const taskMenuButton = actionButtons.taskMenuButton;
  const planHistoryButton = actionButtons.planHistoryButton;
  const gitSidebarButton = actionButtons.gitSidebarButton;

  const acknowledgeIdleSession = useCallback((org: string, repo: string, branch: string) => {
    const key = getWorktreeKey(org, repo, branch);
    const metadata = sessions.sessionMetadataRef.current.get(key);
    if (metadata && metadata.idle) {
      const nextAcknowledgements = new Map(sessions.idleAcknowledgementsRef.current);
      nextAcknowledgements.set(
        key,
        createIdleAcknowledgementEntry(getMetadataLastActivityMs(metadata)),
      );
      sessions.idleAcknowledgementsRef.current = nextAcknowledgements;
      sessions.setIdleAcknowledgementsSnapshot(new Map(nextAcknowledgements));
    }
  }, [getWorktreeKey]);

  const showRepoDashboard = useCallback((org: string, repo: string) => {
    worktreeSelection.handleWorktreeSelection(org, repo, 'main').catch(() => {});
  }, [worktreeSelection]);

  const sidebar = h(Sidebar, {
    width,
    onWidthChange: setWidth,
    isMobileMenuOpen: menus.isMobileMenuOpen,
    onCloseMobileMenu: menus.closeMobileMenu,
    data,
    collapsedOrganisations,
    toggleOrganisationCollapsed,
    openPromptModalForRepo,
    openWorktreeModalForRepo,
    openRepoSettings,
    handleWorktreeSelection: worktreeSelection.handleWorktreeSelection,
    activeWorktree,
    activeRepoDashboard,
    sessionMetadataSnapshot,
    idleAcknowledgementsSnapshot,
    isIdleAcknowledgementCurrent,
    onConfirmDelete: (org: string, repo: string, branch: string) => modals.setConfirmDelete({ org, repo, branch }),
    onAcknowledgeIdle: acknowledgeIdleSession,
    onShowRepoDashboard: showRepoDashboard,
    onAddRepository: () => modals.setShowAddRepoModal(true),
    logoutButton,
  });

  const mainPane = h(MainPane, {
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
    onMobileMenuOpen: () => menus.setIsMobileMenuOpen(true),
    onDashboardRefresh: handleDashboardRefresh,
    onGitSidebarClose: closeGitSidebar,
    onAuthExpired: notifyAuthExpired,
    onGitStatusUpdate: handleGitStatusUpdate,
    onOpenDiff: handleOpenGitDiff,
    onCreateIssuePlan: openIssuePlanModal,
  });

  return h(
    Fragment,
    null,
    h(
      'div',
      {
        className: 'flex h-screen overflow-hidden bg-neutral-950 text-neutral-100 relative flex-col lg:flex-row min-h-0',
        style: { height: '100dvh', minHeight: '100dvh' },
      },
      sidebar,
      h(
        'div',
        { className: 'flex-1 h-full w-full lg:w-auto overflow-hidden flex flex-col min-h-0' },
        mainPane
      )
    ),
    h(ModalContainer, {
      // Add Repository Modal
      showAddRepoModal: modals.showAddRepoModal,
      repoUrl: modals.repoUrl,
      repoInitCommand: modals.repoInitCommand,
      isAddingRepo: repoOps.isAddingRepo,
      onCloseAddRepo: () => modals.setShowAddRepoModal(false),
      onRepoUrlChange: modals.setRepoUrl,
      onInitCommandChange: modals.setRepoInitCommand,
      onSubmitAddRepo: handleAddRepo,
      
      // Edit Repo Settings Modal
      editInitCommandModal: modals.editInitCommandModal,
      onCloseEditRepo: closeEditInitCommandModal,
      onEditRepoValueChange: (value: string) => modals.setEditInitCommandModal(current => ({ ...current, value })),
      onSaveInitCommand: handleSaveInitCommand,
      onRequestDeleteRepo: requestRepoDeletionFromSettings,
      
      // Git Diff Modal
      gitDiffModal: modals.gitDiffModal,
      onCloseGitDiff: handleCloseGitDiff,
      onToggleDiffView: toggleDiffView,
      
      // Plan History Modal
      planModal: modals.planModal,
      onClosePlanModal: handleClosePlanModal,
      onSelectPlan: handleSelectPlan,
      
      // Prompt Worktree Modal
      showPromptWorktreeModal: modals.showPromptWorktreeModal,
      selectedRepo: modals.selectedRepo,
      promptText: modals.promptText,
      promptAgent: modals.promptAgent,
      promptDangerousMode: modals.promptDangerousMode,
      promptInputMode: modals.promptInputMode,
      isCreatingPromptWorktree: worktreeOps.isCreatingPromptWorktree,
      isCreatingPlan: planMgmt.isCreatingPlan,
      isPromptLaunchOptionDisabled,
      showPromptDangerousModeOption,
      onClosePromptModal: () => {
        if (!worktreeOps.isCreatingPromptWorktree) {
          modals.closePromptModal();
        }
      },
      onPromptTextChange: modals.setPromptText,
      onPromptAgentChange: modals.setPromptAgent,
      onPromptDangerousModeChange: modals.setPromptDangerousMode,
      onPromptInputModeChange: modals.setPromptInputMode,
      onCreatePlan: handleCreatePlan,
      onSubmitPromptWorktree: handleCreateWorktreeFromPrompt,
      
      // Create Worktree Modal
      showWorktreeModal: modals.showWorktreeModal,
      branchName: modals.branchName,
      worktreeLaunchOption: modals.worktreeLaunchOption,
      launchDangerousMode: modals.launchDangerousMode,
      isCreatingWorktree: worktreeOps.isCreatingWorktree,
      isLaunchOptionDisabled,
      showDangerousModeOption,
      dangerousModeCheckboxId,
      onCloseWorktreeModal: modals.closeWorktreeModal,
      onBranchNameChange: modals.setBranchName,
      onLaunchOptionChange: modals.setWorktreeLaunchOption,
      onDangerousModeChange: modals.setLaunchDangerousMode,
      onSubmitWorktree: handleCreateWorktree,
      
      // Confirm Delete Worktree Modal
      confirmDelete: modals.confirmDelete,
      isDeletingWorktree: worktreeOps.isDeletingWorktree,
      onCloseConfirmDeleteWorktree: () => modals.setConfirmDelete(null),
      onConfirmDeleteWorktree: handleConfirmDelete,
      
      // Confirm Delete Repo Modal
      confirmDeleteRepo: modals.confirmDeleteRepo,
      isDeletingRepo: repoOps.isDeletingRepo,
      onCloseConfirmDeleteRepo: () => {
        if (!repoOps.isDeletingRepo && modals.confirmDeleteRepo) {
          reopenRepoSettingsAfterConfirm(modals.confirmDeleteRepo);
          modals.setConfirmDeleteRepo(null);
        }
      },
      onConfirmDeleteRepo: handleConfirmDeleteRepo,
      
      // Pending Action Modal
      pendingWorktreeAction,
      pendingActionLoading,
      openActionMenu: menus.openActionMenu,
      onClosePendingAction: () => {
        if (!pendingActionLoading) {
          setPendingWorktreeAction(null);
        }
      },
      onWorktreeAction: handleWorktreeAction,
      onToggleActionMenu: menus.toggleActionMenu,
      getActionMenuRef: menus.getActionMenuRef,
    })
  );
}
