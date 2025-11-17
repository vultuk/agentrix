import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import 'xterm/css/xterm.css';
import { LogOut } from 'lucide-react';
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
import { PortsMenu } from '../../ports/components/PortsMenu.js';
import { closeTerminal } from '../../../services/api/terminalService.js';
import type { Worktree } from '../../../types/domain.js';
import { useCodexSdkChat } from '../../codex-sdk/hooks/useCodexSdkChat.js';
import CodexSdkChatPanel from '../../codex-sdk/components/CodexSdkChatPanel.js';
import { isAuthenticationError } from '../../../services/api/api-client.js';
import * as planModeService from '../../../services/api/planModeService.js';
import * as reposService from '../../../services/api/reposService.js';
import type { PlanDetail, PlanSummary, PlanStatus } from '../../../types/plan-mode.js';
import { usePlanCodexSession } from '../../plans/hooks/usePlanCodexSession.js';
const PLAN_START_TAG = '<start-plan>';
const PLAN_END_TAG = '<end-plan>';

const { createElement: h } = React;
const CODEX_SDK_TAB_PREFIX = 'codex-sdk:';

function getCodexTabId(sessionId: string): string {
  return `${CODEX_SDK_TAB_PREFIX}${sessionId}`;
}

function extractCodexSessionId(tabId: string | null): string | null {
  if (!tabId || typeof tabId !== 'string' || !tabId.startsWith(CODEX_SDK_TAB_PREFIX)) {
    return null;
  }
  return tabId.slice(CODEX_SDK_TAB_PREFIX.length);
}

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
  const fetchedPlanReposRef = useRef<Set<string>>(new Set());
  const [pendingSessionContext, setPendingSessionContext] = useState<'default' | 'new-tab'>('default');
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
  const [plansByRepo, setPlansByRepo] = useState<Record<string, PlanSummary[]>>({});
  const [activePlanContext, setActivePlanContext] = useState<{ org: string; repo: string; id: string } | null>(null);
  const [activePlan, setActivePlan] = useState<PlanDetail | null>(null);
  const [planWorkspaceError, setPlanWorkspaceError] = useState<string | null>(null);
  const [isPlanWorkspaceLoading, setIsPlanWorkspaceLoading] = useState(false);
  const [isPlanBuildPending, setIsPlanBuildPending] = useState(false);
  const [isDeletingPlan, setIsDeletingPlan] = useState(false);
  const [isSubmittingPlanComposer, setIsSubmittingPlanComposer] = useState(false);
  const notifyAuthExpired = useCallback(() => {
    if (typeof onAuthExpired === 'function') {
      onAuthExpired();
    }
  }, [onAuthExpired]);
  const planChat = usePlanCodexSession({
    sessionId: activePlan?.codexSessionId ?? null,
    onAuthExpired: notifyAuthExpired,
  });
  const lastPlanUpdateEventRef = useRef<string | null>(null);
  
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
  const [pendingCloseSessionId, setPendingCloseSessionId] = useState<string | null>(null);
  const [isQuickSessionPending, setIsQuickSessionPending] = useState(false);
  
  // Use dashboard hook first (needed by repo data hook)
  const dashboard = useDashboard({ onAuthExpired });
  const {
    activeRepoDashboard,
    setActiveRepoDashboard,
    dashboardData,
    dashboardError,
    isDashboardLoading,
    clearDashboardPolling,
    dashboardCacheRef,
    setDashboardData,
    setDashboardError,
    setIsDashboardLoading,
    refreshDashboard,
  } = dashboard;
  
  // Use repository data hook
  const repoData = useRepositoryData({
    onAuthExpired,
    onSessionRemoved: sessions.removeTrackedSession,
    sessionMapRef: terminal.sessionMapRef,
    sessionKeyByIdRef: terminal.sessionKeyByIdRef,
    isRealtimeConnected,
    setActiveRepoDashboard,
  });
  const data = repoData.data;
  const activeWorktree = repoData.activeWorktree;
  const setActiveWorktree = repoData.setActiveWorktree;
  
  const handleTaskComplete = useCallback((task: any, pending: any) => {
    // handleTaskComplete relies on pendingTaskProcessorRef being assigned later in the render cycle.
    // The ref indirection avoids dependency churn while preserving a stable callback signature.
    pendingTaskProcessorRef.current?.(task, pending);
  }, []);
  
  // Use task management hook
  const taskMgmt = useTaskManagement({ onAuthExpired, onTaskComplete: handleTaskComplete });
  
  // Use Git sidebar hook
  const gitSidebar = useGitSidebar(repoData.activeWorktree, getWorktreeKey);

  const codexChat = useCodexSdkChat({ activeWorktree, onAuthExpired });
  const {
    sessions: codexSessions,
    activeSessionId: activeCodexSessionId,
    activeSession: codexActiveSession,
    events: codexEvents,
    connectionState: codexConnectionState,
    lastError: codexLastError,
    isSending: isCodexSending,
    connectionStateBySession: codexConnectionStates,
    createSessionForWorktree: createCodexSessionForWorktree,
    deleteSession: removeCodexSession,
    sendMessage: sendCodexMessage,
    setActiveSessionId: setActiveCodexSessionId,
  } = codexChat;
  const launchCodexSessionForWorktree = useCallback(
    async (worktree: Worktree | null, options?: { initialMessage?: string }) => {
      if (!worktree) {
        return null;
      }
      const summary = await createCodexSessionForWorktree(worktree);
      if (summary) {
        setActiveWorktree(worktree);
        const tabId = getCodexTabId(summary.id);
        setSelectedTabId(tabId);
        setActiveCodexSessionId(summary.id);
        if (options?.initialMessage) {
          setTimeout(() => {
            void (async () => {
              try {
                await sendCodexMessage(summary.id, options.initialMessage);
              } catch (error) {
                console.warn('[plan-mode] Failed to send initial Codex message:', error);
              }
            })();
          }, 500);
        }
      }
      return summary;
    },
    [createCodexSessionForWorktree, sendCodexMessage, setActiveCodexSessionId, setActiveWorktree, setSelectedTabId],
  );
  
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
  const refreshPlansForRepo = useCallback(
    async (org: string, repo: string) => {
      if (!org || !repo) {
        return;
      }
      try {
        const plans = await planModeService.listPlans(org, repo);
        const key = `${org}/${repo}`;
        setPlansByRepo((prev) => ({ ...prev, [key]: plans }));
        fetchedPlanReposRef.current.add(key);
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          notifyAuthExpired();
          return;
        }
        console.error('[plan-mode] Failed to load plans', error);
      }
    },
    [notifyAuthExpired],
  );
  
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
  useEffect(() => {
    if (!selectedTabId && sessionId) {
      setSelectedTabId(sessionId);
    }
  }, [selectedTabId, sessionId]);
  useEffect(() => {
    if (!selectedTabId && codexSessions.length > 0) {
      const nextId = codexSessions[0]?.id;
      if (nextId) {
        setSelectedTabId(getCodexTabId(nextId));
        setActiveCodexSessionId(nextId);
      }
    }
  }, [codexSessions, selectedTabId, setActiveCodexSessionId]);
  useEffect(() => {
    if (!activePlanContext) {
      setActivePlan(null);
      setPlanWorkspaceError(null);
      setIsPlanWorkspaceLoading(false);
      return;
    }
    lastPlanUpdateEventRef.current = null;
    let cancelled = false;
    setIsPlanWorkspaceLoading(true);
    setPlanWorkspaceError(null);
    const { org, repo, id } = activePlanContext;
    const loadPlan = async () => {
      try {
        const detail = await planModeService.fetchPlan(org, repo, id);
        if (cancelled) {
          return;
        }
        setActivePlan(detail);
        setPlanWorkspaceError(null);
        setIsPlanWorkspaceLoading(false);
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          notifyAuthExpired();
          return;
        }
        if (cancelled) {
          return;
        }
        setPlanWorkspaceError(error?.message || 'Failed to load plan');
        setIsPlanWorkspaceLoading(false);
      }
    };
    void loadPlan();
    return () => {
      cancelled = true;
    };
  }, [activePlanContext, notifyAuthExpired]);
  useEffect(() => {
    if (!activePlanContext || !activePlan || activePlan.codexSessionId) {
      return;
    }
    const { org, repo, id } = activePlanContext;
    let cancelled = false;
    const ensureSession = async () => {
      try {
        const detail = await planModeService.ensurePlanSession(org, repo, id);
        if (cancelled) {
          return;
        }
        setActivePlan(detail);
        await refreshPlansForRepo(org, repo);
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          notifyAuthExpired();
          return;
        }
        if (cancelled) {
          return;
        }
        console.error('[plan-mode] Failed to start plan session', error);
      }
    };
    void ensureSession();
    return () => {
      cancelled = true;
    };
  }, [activePlan, activePlanContext, notifyAuthExpired, refreshPlansForRepo]);

  useEffect(() => {
    if (!activePlanContext) {
      return;
    }
    const latestPlanEvent = [...planChat.events]
      .reverse()
      .find(
        (event) =>
          event &&
          event.type === 'agent_response' &&
          typeof event.text === 'string' &&
          event.text.includes(PLAN_START_TAG) &&
          event.text.includes(PLAN_END_TAG),
      );
    if (!latestPlanEvent) {
      return;
    }
    const identifier = latestPlanEvent.id || `${latestPlanEvent.timestamp}-${planChat.events.length}`;
    if (lastPlanUpdateEventRef.current === identifier) {
      return;
    }
    lastPlanUpdateEventRef.current = identifier;
    const { org, repo, id } = activePlanContext;
    void (async () => {
      try {
        const detail = await planModeService.fetchPlan(org, repo, id);
        setActivePlan(detail);
        await refreshPlansForRepo(org, repo);
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          notifyAuthExpired();
          return;
        }
        console.warn('[plan-mode] Failed to refresh plan after Codex update:', error);
      }
    })();
  }, [activePlanContext, notifyAuthExpired, planChat.events, refreshPlansForRepo]);
  useEffect(() => {
    if ((activeWorktree || activeRepoDashboard) && activePlanContext) {
      setActivePlanContext(null);
      setActivePlan(null);
      setPlanWorkspaceError(null);
    }
  }, [activePlanContext, activeRepoDashboard, activeWorktree]);
  useEffect(() => {
    const repoKeys: string[] = [];
    Object.entries(data).forEach(([org, repos]) => {
      Object.keys(repos || {}).forEach((repo) => {
        repoKeys.push(`${org}/${repo}`);
      });
    });
    setPlansByRepo((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => {
        if (!repoKeys.includes(key)) {
          delete next[key];
          fetchedPlanReposRef.current.delete(key);
        }
      });
      return next;
    });
    repoKeys.forEach((key) => {
      if (fetchedPlanReposRef.current.has(key)) {
        return;
      }
      fetchedPlanReposRef.current.add(key);
      const [org, repo] = key.split('/');
      if (org && repo) {
        void refreshPlansForRepo(org, repo);
      }
    });
  }, [data, refreshPlansForRepo]);
  
  const tasks = taskMgmt.tasks;
  const pendingLaunchesRef = taskMgmt.pendingLaunchesRef;
  
  const knownSessionsRef = sessions.knownSessionsRef;
  const sessionMetadataSnapshot = sessions.sessionMetadataSnapshot;
  const sessionMetadataRef = sessions.sessionMetadataRef;
  const idleAcknowledgementsSnapshot = sessions.idleAcknowledgementsSnapshot;
  const activeWorktreeKey = activeWorktree
    ? getWorktreeKey(activeWorktree.org, activeWorktree.repo, activeWorktree.branch)
    : null;
  const previousWorktreeKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (previousWorktreeKeyRef.current === activeWorktreeKey) {
      return;
    }
    previousWorktreeKeyRef.current = activeWorktreeKey;
    setSelectedTabId(null);
    setActiveCodexSessionId(null);
  }, [activeWorktreeKey, setActiveCodexSessionId]);
  const activeTerminalSessions =
    activeWorktreeKey && sessionMetadataSnapshot.has(activeWorktreeKey)
      ? sessionMetadataSnapshot.get(activeWorktreeKey)?.sessions ?? []
      : [];
  const codexSessionTabs =
    activeWorktree && codexSessions.length > 0
      ? codexSessions.map((entry) => ({
          id: getCodexTabId(entry.id),
          label: entry.label || 'Codex SDK',
          kind: 'automation' as const,
          tool: 'agent' as const,
          idle: (codexConnectionStates?.[entry.id] ?? 'idle') !== 'connected',
          usingTmux: false,
          lastActivityAt: entry.lastActivityAt,
          createdAt: entry.createdAt,
          tmuxSessionName: null,
        }))
      : [];
  const combinedTerminalSessions = [...activeTerminalSessions, ...codexSessionTabs];
  const activeSessionIdForTabs = selectedTabId || terminal.sessionId;
  
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
    async (issue: any, repoInfo: { org: string; repo: string }) => {
      if (!issue || !repoInfo) {
        return;
      }
      const { org, repo } = repoInfo;
      if (!org || !repo) {
        return;
      }

      let issueDetails = issue;
      let body = typeof issue?.body === 'string' ? issue.body : '';

      if (!body?.trim() && typeof issue?.number === 'number') {
        try {
          const fetched = await reposService.fetchIssue(org, repo, issue.number);
          if (fetched?.issue && typeof fetched.issue === 'object') {
            issueDetails = fetched.issue;
            if (typeof fetched.issue['body'] === 'string') {
              body = fetched.issue['body'];
            }
          }
        } catch (error) {
          console.warn('[plan-mode] Failed to load issue body for Create Plan:', error);
        }
      }

      const title =
        typeof issueDetails?.title === 'string' && issueDetails.title.trim().length > 0
          ? issueDetails.title.trim()
          : `Issue #${issueDetails?.number ?? ''}`.trim();
      const markdown = body && body.trim().length > 0 ? body : title;

      menus.setIsMobileMenuOpen(false);
      try {
        const detail = await planModeService.createPlan({
          org,
          repo,
          title: title || 'New Plan',
          markdown,
          description: body?.trim() || undefined,
          issueNumber: typeof issue?.number === 'number' ? issue.number : undefined,
          issueUrl: typeof issue?.url === 'string' ? issue.url : undefined,
        });
        setActivePlanContext({ org, repo, id: detail.id });
        setActivePlan(detail);
        await refreshPlansForRepo(org, repo);
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          notifyAuthExpired();
          return;
        }
        console.error('[plan-mode] Failed to create plan from issue', error);
        window.alert('Failed to create plan from issue. Check server logs for details.');
      }
    },
    [menus, notifyAuthExpired, refreshPlansForRepo],
  );

  const handleSelectPlanEntry = useCallback(
    (org: string, repo: string, planId: string) => {
      if (!org || !repo || !planId) {
        return;
      }
      setActivePlanContext({ org, repo, id: planId });
      setActiveWorktree(null);
      setActiveRepoDashboard(null);
      menus.setIsMobileMenuOpen(false);
    },
    [dashboard, menus, setActiveWorktree],
  );

  const handleRequestPlanDelete = useCallback(() => {
    if (!activePlan) {
      return;
    }
    modals.openPlanDeleteModal(activePlan.title);
  }, [activePlan, modals]);

  const persistPlanUpdate = useCallback(
    async (update: { markdown?: string; status?: PlanStatus }) => {
      if (!activePlanContext) {
        return null;
      }
      const { org, repo, id } = activePlanContext;
      try {
        let detail: PlanDetail | null = null;
        if (typeof update.markdown === 'string') {
          detail = await planModeService.updatePlanMarkdown(org, repo, id, update.markdown);
        }
        if (update.status) {
          detail = await planModeService.updatePlanStatus(org, repo, id, update.status);
        }
        if (detail) {
          setActivePlan(detail);
          await refreshPlansForRepo(org, repo);
        }
        return detail;
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          notifyAuthExpired();
          return null;
        }
        console.error('[plan-mode] Failed to update plan', error);
        throw error;
      }
    },
    [activePlanContext, notifyAuthExpired, refreshPlansForRepo],
  );

  const handleSavePlanMarkdown = useCallback(
    async (markdown: string) => {
      try {
        await persistPlanUpdate({ markdown });
        setPlanWorkspaceError(null);
      } catch (error: any) {
        setPlanWorkspaceError(error?.message || 'Failed to update plan');
      }
    },
    [persistPlanUpdate],
  );

  const handleMarkPlanReady = useCallback(async () => {
    try {
      await persistPlanUpdate({ status: 'ready' });
      setPlanWorkspaceError(null);
    } catch (error: any) {
      setPlanWorkspaceError(error?.message || 'Failed to update plan');
    }
  }, [persistPlanUpdate]);

  const buildExecutionMessage = useCallback(
    (org: string, repo: string, branch: string | null, plan: PlanDetail) => {
      const scopeLine = branch
        ? `You are working in ${org}/${repo} on branch ${branch}.`
        : `You are working in ${org}/${repo}.`;
      return [
        scopeLine,
        'Implement the approved plan exactly as written below. Do not restate the plan; start executing the steps.',
        '',
        plan.markdown,
      ].join('\n');
    },
    [],
  );

  const handlePlanBuild = useCallback(async () => {
    if (!activePlanContext || !activePlan) {
      return;
    }
    const { org, repo, id } = activePlanContext;
    setIsPlanBuildPending(true);
    try {
      const result = await planModeService.buildPlan(org, repo, id);
      if (result?.taskId) {
        pendingLaunchesRef.current.set(result.taskId, {
          kind: 'plan-build',
          org,
          repo,
          requestedBranch: result.plan?.worktreeBranch || '',
          launchOption: 'codex_sdk',
          planInstructions: buildExecutionMessage(org, repo, result.plan?.worktreeBranch || null, activePlan),
        });
      }
      await refreshPlansForRepo(org, repo);
      setActivePlanContext(null);
      setActivePlan(null);
    } catch (error: any) {
      if (isAuthenticationError(error)) {
        notifyAuthExpired();
      } else {
        setPlanWorkspaceError(error?.message || 'Failed to start build');
      }
    } finally {
      setIsPlanBuildPending(false);
    }
  }, [
    activePlan,
    activePlanContext,
    buildExecutionMessage,
    notifyAuthExpired,
    pendingLaunchesRef,
    refreshPlansForRepo,
  ]);

  const handleConfirmPlanDelete = useCallback(async () => {
    if (!activePlanContext) {
      return;
    }
    const { org, repo, id } = activePlanContext;
    setIsDeletingPlan(true);
    try {
      await planModeService.deletePlan(org, repo, id);
      setActivePlanContext(null);
      setActivePlan(null);
      modals.closePlanDeleteModal();
      await refreshPlansForRepo(org, repo);
    } catch (error: any) {
      if (isAuthenticationError(error)) {
        notifyAuthExpired();
      } else {
        console.error('[plan-mode] Failed to delete plan', error);
        window.alert(error?.message || 'Failed to delete plan. Check server logs.');
      }
    } finally {
      setIsDeletingPlan(false);
    }
  }, [activePlanContext, modals, notifyAuthExpired, refreshPlansForRepo]);

  const handleSendPlanMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      if (!activePlanContext || !activePlan) {
        window.alert('Open a plan before sending feedback to the agent.');
        return;
      }
      const { org, repo } = activePlanContext;
      const message = [
        `You are updating the existing plan for ${org}/${repo} titled "${activePlan.title}".`,
        `Rewrite the entire plan strictly between ${PLAN_START_TAG} and ${PLAN_END_TAG}, preserving the canonical sections: Overview, Scope & Constraints, Implementation Plan (with subsystem subsections), Testing & Validation, Risks & Mitigations table, and the Done Checklist.`,
        'Incorporate the user feedback below and respond with the refreshed plan only (no commentary outside the tags).',
        'User feedback:',
        trimmed,
      ].join('\n\n');
      try {
        await planChat.sendMessage(message);
      } catch (error) {
        console.error('[plan-mode] Failed to send plan feedback to Codex:', error);
        window.alert('Failed to send message to Codex. Check the server logs for details.');
      }
    },
    [activePlan, activePlanContext, planChat.sendMessage],
  );

  const handleOpenPlanComposer = useCallback(
    (org: string, repo: string) => {
      if (!org || !repo) {
        return;
      }
      modals.openPlanComposerModal(org, repo);
      menus.setIsMobileMenuOpen(false);
    },
    [menus, modals],
  );

  const handlePlanComposerFieldChange = useCallback(
    (field: 'title' | 'body', value: string) => {
      modals.setPlanComposerModal((current) => ({ ...current, [field]: value }));
    },
    [modals],
  );

  const handleSubmitPlanComposer = useCallback(async () => {
    const modal = modals.planComposerModal;
    if (!modal.org || !modal.repo) {
      return;
    }
    const title = modal.title.trim() || 'New Plan';
    const markdown = modal.body?.trim() ? modal.body : `# ${title}\n`;
    setIsSubmittingPlanComposer(true);
    try {
      const detail = await planModeService.createPlan({
        org: modal.org,
        repo: modal.repo,
        title,
        markdown,
        description: modal.body?.trim() || markdown,
      });
      setActivePlanContext({ org: modal.org, repo: modal.repo, id: detail.id });
      setActivePlan(detail);
      await refreshPlansForRepo(modal.org, modal.repo);
      modals.closePlanComposerModal();
    } catch (error: any) {
      if (isAuthenticationError(error)) {
        notifyAuthExpired();
      } else {
        window.alert(error?.message || 'Failed to create plan.');
      }
    } finally {
      setIsSubmittingPlanComposer(false);
    }
  }, [modals, notifyAuthExpired, refreshPlansForRepo]);

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

  const openTerminalForWorktreeRef = useRef<((worktree: Worktree | null, options?: { command?: string | null; prompt?: string | null; sessionId?: string | null; newSession?: boolean }) => Promise<any>) | null>(null);
  
  const { processPendingTask: processPendingWorktree } = usePendingTaskProcessor({
    getWorktreeKey,
    getCommandForLaunch,
    sessionMapRef,
    knownSessionsRef,
    openTerminalForWorktreeRef,
    activeWorktreeRef,
    clearDashboardPolling,
    setActiveRepoDashboard,
    setDashboardError,
    setIsDashboardLoading,
    setActiveWorktree,
    setPendingWorktreeAction,
    setIsMobileMenuOpen: menus.setIsMobileMenuOpen,
    closePromptModal: modals.closePromptModal,
    closeWorktreeModal: modals.closeWorktreeModal,
    pendingLaunchesRef,
    startCodexSdkSession: async (worktree: Worktree, options?: { initialMessage?: string }) => {
      await launchCodexSessionForWorktree(worktree, options);
    },
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
    dashboardCacheRef,
    clearDashboardPolling,
    setPendingWorktreeAction,
    setActiveWorktree: repoData.setActiveWorktree,
    setActiveRepoDashboard,
    setDashboardData,
    setDashboardError,
    setIsDashboardLoading,
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
    openTerminalForWorktreeRef.current = ((worktree: Worktree | null, options?: { command?: string | null; prompt?: string | null; sessionId?: string | null; newSession?: boolean }) => {
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
    onRepos: (repositories) => {
      repoData.applyDataUpdate(repositories);
    },
    onSessions: ({ sessions }) => {
      syncKnownSessions(sessions);
    },
    onTasks: (tasks) => {
      applyTaskUpdate(tasks);
    },
    onConnect: () => {
      setIsRealtimeConnected(true);
    },
    onDisconnect: () => {
      setIsRealtimeConnected(false);
    },
  });

  const handleSelectSessionTab = useCallback(
    async (tabId: string | null) => {
      if (!tabId) {
        return;
      }
      const codexSessionId = extractCodexSessionId(tabId);
      if (codexSessionId) {
        setSelectedTabId(tabId);
        setActiveCodexSessionId(codexSessionId);
        return;
      }
      if (!activeWorktree) {
        return;
      }
      if (terminal.sessionId === tabId) {
        setSelectedTabId(tabId);
        return;
      }
      try {
        await openTerminalForWorktree(activeWorktree, { sessionId: tabId });
        setSelectedTabId(tabId);
        setActiveCodexSessionId(null);
      } catch (error: any) {
        if (error && error.message === 'AUTH_REQUIRED') {
          return;
        }
        console.error('Failed to attach to session', error);
        window.alert('Failed to attach to the selected session.');
      }
    },
    [activeWorktree, openTerminalForWorktree, setActiveCodexSessionId, terminal.sessionId],
  );

  const handleCreateSessionTab = useCallback(() => {
    if (!activeWorktree) {
      return;
    }
    menus.closeActionMenu();
    setPendingActionLoading(null);
    setPendingSessionContext('new-tab');
    setPendingWorktreeAction(activeWorktree);
  }, [activeWorktree, menus, setPendingActionLoading, setPendingWorktreeAction]);

  const handleQuickSessionLaunch = useCallback(
    async (tool: 'terminal' | 'agent') => {
      if (!activeWorktree || isQuickSessionPending) {
        return;
      }
      setIsQuickSessionPending(true);
      try {
        await openTerminalForWorktree(activeWorktree, {
          newSession: true,
          sessionTool: tool,
        });
      } catch (error: any) {
        if (error && error.message === 'AUTH_REQUIRED') {
          return;
        }
        console.error('Failed to launch session', error);
        window.alert('Failed to launch the selected session. Check server logs for details.');
      } finally {
        setIsQuickSessionPending(false);
      }
    },
    [activeWorktree, isQuickSessionPending, openTerminalForWorktree],
  );

  const handleCloseSessionTab = useCallback(
    async (tabId: string | null) => {
      if (!tabId) {
        return;
      }
      const codexSessionId = extractCodexSessionId(tabId);
      if (codexSessionId) {
        const index = codexSessions.findIndex((entry) => entry.id === codexSessionId);
        const fallbackEntry =
          index >= 0
            ? codexSessions[index > 0 ? index - 1 : index + 1]
            : codexSessions[0];
        const fallbackTabId =
          fallbackEntry?.id ? getCodexTabId(fallbackEntry.id) : terminal.sessionId ?? null;
        await removeCodexSession(codexSessionId);
        setSelectedTabId((current) => {
          if (current !== tabId) {
            return current;
          }
          const fallbackSessionId = extractCodexSessionId(fallbackTabId);
          setActiveCodexSessionId(fallbackSessionId);
          return fallbackTabId;
        });
        return;
      }
      if (!activeWorktree || pendingCloseSessionId === tabId) {
        return;
      }
      const worktreeKey = getWorktreeKey(activeWorktree.org, activeWorktree.repo, activeWorktree.branch);
      const metadata = sessionMetadataRef.current.get(worktreeKey);
      const tabs = Array.isArray(metadata?.sessions) ? metadata.sessions : [];
      const sessionIndex = tabs.findIndex((entry: any) => entry && entry.id === tabId);
      const isActiveSession = terminal.sessionId === tabId;
      let fallbackId: string | null = null;
      if (isActiveSession && tabs.length > 1) {
        if (sessionIndex >= 0) {
          const candidateIndex = sessionIndex > 0 ? sessionIndex - 1 : sessionIndex + 1;
          fallbackId = tabs[candidateIndex]?.id ?? null;
        } else {
          fallbackId = tabs.find((entry: any) => entry && entry.id !== tabId)?.id ?? null;
        }
      }
      setPendingCloseSessionId(tabId);
      try {
        await closeTerminal(tabId);
        if (isActiveSession) {
          if (fallbackId) {
            await openTerminalForWorktree(activeWorktree, { sessionId: fallbackId });
            setSelectedTabId(fallbackId);
            setActiveCodexSessionId(null);
          } else {
            sessionMapRef.current.delete(worktreeKey);
            sessionKeyByIdRef.current.delete(tabId);
            await openTerminalForWorktree(null, {});
            setSelectedTabId(null);
          }
        } else if (selectedTabId === tabId) {
          const fallbackTabId =
            fallbackId ?? (codexSessions[0] ? getCodexTabId(codexSessions[0].id) : terminal.sessionId ?? null);
          setSelectedTabId(fallbackTabId);
          setActiveCodexSessionId(extractCodexSessionId(fallbackTabId));
        }
      } catch (error: any) {
        if (!error || error.message !== 'AUTH_REQUIRED') {
          console.error('Failed to close terminal session', error);
          window.alert('Failed to close the session. Check server logs for details.');
        }
      } finally {
        setPendingCloseSessionId((current) => (current === tabId ? null : current));
      }
    },
    [
      activeWorktree,
      codexSessions,
      getWorktreeKey,
      openTerminalForWorktree,
      pendingCloseSessionId,
      removeCodexSession,
      selectedTabId,
      sessionMetadataRef,
      sessionKeyByIdRef,
      sessionMapRef,
      setActiveCodexSessionId,
      terminal.sessionId,
    ],
  );

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
          let resetPendingContext = false;
          if (sessionMapRef.current.has(key) || knownSessionsRef.current.has(key)) {
            setActiveWorktree({ org: info.org, repo: info.repo, branch: firstNonMain });
            try {
              await openTerminalForWorktree({ org: info.org, repo: info.repo, branch: firstNonMain });
              setPendingWorktreeAction(null);
              resetPendingContext = true;
            } catch {
              window.alert('Failed to reconnect to the existing session.');
            }
          } else {
            setPendingWorktreeAction({ org: info.org, repo: info.repo, branch: firstNonMain });
            resetPendingContext = true;
          }
          if (resetPendingContext) {
            setPendingSessionContext('default');
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
        setPendingSessionContext('default');
      }
      if (
        activeWorktree &&
        activeWorktree.org === org &&
        activeWorktree.repo === repo
      ) {
        disposeSocket();
        disposeTerminal();
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
    const worktree = pendingWorktreeAction;
    const isDangerous = action.endsWith('-dangerous');
    const resolvedAction = isDangerous ? action.replace(/-dangerous$/, '') : action;
    if (resolvedAction === 'codex_sdk') {
      setPendingActionLoading(action);
      try {
        const summary = await launchCodexSessionForWorktree(worktree);
        if (summary) {
          const tabId = getCodexTabId(summary.id);
          setActiveWorktree(worktree);
          setSelectedTabId(tabId);
          setActiveCodexSessionId(summary.id);
        }
        setPendingWorktreeAction(null);
      } catch (error) {
        console.error('Failed to open Codex SDK chat', error);
        window.alert('Failed to open Codex SDK chat. Check server logs for details.');
      } finally {
        setPendingActionLoading(null);
      }
      return;
    }
    const command = getCommandForLaunch(resolvedAction, isDangerous);
    const sessionTool: 'terminal' | 'agent' =
      resolvedAction === 'terminal' || resolvedAction === 'vscode' ? 'terminal' : 'agent';

    if (pendingSessionContext === 'new-tab' && sessionTool === 'agent' && !command) {
      window.alert('No command configured for the selected launch option.');
      return;
    }

    setPendingActionLoading(action);
    clearDashboardPolling();
    setActiveRepoDashboard(null);
    setDashboardError(null);
    setIsDashboardLoading(false);
    setActiveWorktree(worktree);
    try {
      if (pendingSessionContext === 'new-tab') {
        await openTerminalForWorktree(worktree, {
          newSession: true,
          sessionTool,
          ...(command ? { command } : {}),
        });
      } else {
        const options: { command?: string; sessionTool?: 'terminal' | 'agent' } = {};
        if (command) {
          options.command = command;
        }
        if (sessionTool === 'agent') {
          options.sessionTool = 'agent';
        }
        await openTerminalForWorktree(worktree, options);
      }
      setPendingWorktreeAction(null);
      setPendingSessionContext('default');
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
    getCommandForLaunch,
    openTerminalForWorktree,
    pendingActionLoading,
    pendingSessionContext,
    pendingWorktreeAction,
    setActiveRepoDashboard,
    setActiveWorktree,
    setDashboardError,
    setIsDashboardLoading,
    setPendingActionLoading,
    setPendingSessionContext,
    setPendingWorktreeAction,
    setSelectedTabId,
    setActiveCodexSessionId,
    launchCodexSessionForWorktree,
  ]);

  const handleDashboardRefresh = useCallback(() => {
    refreshDashboard();
  }, [refreshDashboard]);

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
            'aria-busy': Boolean(isLoggingOut),
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

  const portsMenuNode = h(PortsMenu, {
    onAuthExpired: notifyAuthExpired,
  });

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
    portsMenuNode,
  });

  const githubControls = actionButtons.githubControls;
  const taskMenuButton = actionButtons.taskMenuButton;
  const planHistoryButton = actionButtons.planHistoryButton;
  const gitSidebarButton = actionButtons.gitSidebarButton;
  const portsMenuButton = actionButtons.portsMenuButton;

  useEffect(() => {
    if (!activeWorktree) {
      return;
    }
    const worktreeKey = getWorktreeKey(activeWorktree.org, activeWorktree.repo, activeWorktree.branch);
    const hasTerminalSessions =
      sessionMapRef.current.has(worktreeKey) || knownSessionsRef.current.has(worktreeKey);
    if (hasTerminalSessions) {
      return;
    }
    if (!codexSessions.length) {
      return;
    }
    const firstSession = codexSessions[0];
    if (!firstSession) {
      return;
    }
    const tabId = getCodexTabId(firstSession.id);
    if (selectedTabId === tabId && activeCodexSessionId === firstSession.id) {
      return;
    }
    setSelectedTabId(tabId);
    setActiveCodexSessionId(firstSession.id);
  }, [
    activeCodexSessionId,
    activeWorktree,
    codexSessions,
    getWorktreeKey,
    knownSessionsRef,
    selectedTabId,
    sessionMapRef,
    setActiveCodexSessionId,
    setSelectedTabId,
  ]);

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

  const handleSendCodexMessage = useCallback(
    async (text: string) => {
      if (!activeCodexSessionId) {
        return;
      }
      await sendCodexMessage(activeCodexSessionId, text);
    },
    [activeCodexSessionId, sendCodexMessage],
  );

  const renderSessionContent = useCallback(
    (tabId: string | null) => {
      const sessionId = extractCodexSessionId(tabId);
      if (!sessionId || !codexActiveSession || codexActiveSession.id !== sessionId) {
        return null;
      }
      return h(CodexSdkChatPanel, {
        events: codexEvents,
        isSending: isCodexSending,
        connectionState: codexConnectionState,
        session: codexActiveSession,
        lastError: codexLastError,
        onSend: handleSendCodexMessage,
      });
    },
    [codexActiveSession, codexConnectionState, codexEvents, codexLastError, handleSendCodexMessage, isCodexSending],
  );

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
    plansByRepo,
    activePlanId: activePlanContext?.id || null,
    onSelectPlan: handleSelectPlanEntry,
    onCreatePlan: handleOpenPlanComposer,
  });

  const mainPane = h(MainPane, {
    activeWorktree,
    activeRepoDashboard,
    activePlan,
    isPlanWorkspaceLoading,
    planWorkspaceError,
    onDeletePlan: handleRequestPlanDelete,
    onSavePlan: handleSavePlanMarkdown,
    onMarkPlanReady: handleMarkPlanReady,
    onBuildPlan: handlePlanBuild,
    isPlanBuildPending,
    planChatState: {
      events: planChat.events,
      isSending: planChat.isSending,
      connectionState: planChat.connectionState,
      session: planChat.session,
      lastError: planChat.lastError,
      onSend: handleSendPlanMessage,
    },
    dashboardData,
    isDashboardLoading,
    dashboardError,
    terminalContainerRef,
    terminalSessions: combinedTerminalSessions,
    activeSessionId: activeSessionIdForTabs,
    onSessionSelect: handleSelectSessionTab,
    onSessionClose: handleCloseSessionTab,
    onSessionCreate: handleCreateSessionTab,
    onQuickLaunchSession: handleQuickSessionLaunch,
    isSessionCreationPending: !activeWorktree,
    isQuickSessionPending,
    pendingCloseSessionId,
    isGitSidebarOpen,
    githubControls,
    taskMenuButton,
    planHistoryButton,
    gitSidebarButton,
    portsMenuButton,
    registerMobileMenuButton,
    onMobileMenuOpen: () => menus.setIsMobileMenuOpen(true),
    onDashboardRefresh: handleDashboardRefresh,
    onGitSidebarClose: closeGitSidebar,
    onAuthExpired: notifyAuthExpired,
    onGitStatusUpdate: handleGitStatusUpdate,
    onOpenDiff: handleOpenGitDiff,
    onCreateIssuePlan: openIssuePlanModal,
    renderSessionContent,
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
      
      // Plan Composer Modal
      planComposerModal: modals.planComposerModal,
      onClosePlanComposer: modals.closePlanComposerModal,
      onPlanComposerFieldChange: handlePlanComposerFieldChange,
      onSubmitPlanComposer: handleSubmitPlanComposer,
      isSubmittingPlanComposer,
      planDeleteModal: modals.planDeleteModal,
      onClosePlanDeleteModal: modals.closePlanDeleteModal,
      onConfirmPlanDelete: handleConfirmPlanDelete,
      isDeletingPlan,
      
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
          setPendingSessionContext('default');
        }
      },
      onWorktreeAction: handleWorktreeAction,
      onToggleActionMenu: menus.toggleActionMenu,
      getActionMenuRef: menus.getActionMenuRef,
    })
  );
}
