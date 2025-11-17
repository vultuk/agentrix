import React from 'react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

vi.mock('xterm/css/xterm.css', () => ({}), { virtual: true });
vi.mock('lucide-react', () => ({ LogOut: () => null }));
vi.mock('../../../../config/commands.js', () => ({ ISSUE_PLAN_PROMPT_TEMPLATE: '' }));
vi.mock('../../../../utils/constants.js', () => ({
  REPOSITORY_POLL_INTERVAL_MS: 1_000,
  SESSION_POLL_INTERVAL_MS: 1_000,
}));
vi.mock('../../../../components/Spinner.js', () => ({ renderSpinner: () => null }));
vi.mock('../../../../utils/activity.js', () => ({
  isIdleAcknowledgementCurrent: () => true,
  getMetadataLastActivityMs: () => 0,
  createIdleAcknowledgementEntry: () => ({ acknowledgedAt: Date.now() }),
}));

const noop = () => {};
const noopAsync = async () => {};
const createRef = <T,>(value: T) => ({ current: value });
const createPlanDetail = () => ({
  id: 'plan-1',
  org: 'acme',
  repo: 'demo',
  title: 'Plan',
  markdown: '',
  status: 'draft',
  slug: 'plan',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  source: { type: 'manual' as const },
  lastChange: null,
  codexSessionId: null,
  worktreeBranch: null,
  defaultBranch: null,
});

vi.mock('../../hooks/useRepoBrowserState.js', () => ({
  useRepoBrowserState: () => ({
    width: 320,
    setWidth: noop,
    isRealtimeConnected: false,
    setIsRealtimeConnected: noop,
    pendingWorktreeAction: null,
    setPendingWorktreeAction: noop,
    pendingActionLoading: null,
    setPendingActionLoading: noop,
    collapsedOrganisations: {},
    toggleOrganisationCollapsed: noop,
    getWorktreeKey: (org: string, repo: string, branch: string) => `${org}/${repo}/${branch}`,
  }),
}));

vi.mock('../../hooks/useRepoBrowserModals.js', () => {
  const state = {
    showAddRepoModal: false,
    repoUrl: '',
    repoInitCommand: '',
    editInitCommandModal: { open: false, org: null, repo: null, value: '', error: null, saving: false },
    confirmDeleteRepo: null,
    confirmDelete: null,
    showPromptWorktreeModal: false,
    selectedRepo: null as [string, string] | null,
    promptText: '',
    promptAgent: 'codex',
    promptDangerousMode: false,
    promptInputMode: 'edit',
    showWorktreeModal: false,
    branchName: '',
    worktreeLaunchOption: 'terminal',
    launchDangerousMode: false,
    planModal: { open: false, loading: false, plans: [], context: null },
    planComposerModal: { open: false, org: null, repo: null, title: '', body: '' },
    gitDiffModal: { open: false, loading: false, error: null, diff: '', file: null, view: 'split' },
  };
  const wrapSetter = (key: keyof typeof state) => (value: any) => {
    (state as any)[key] = typeof value === 'function' ? value((state as any)[key]) : value;
  };
  return {
    useRepoBrowserModals: () => ({
      ...state,
      setShowAddRepoModal: wrapSetter('showAddRepoModal'),
      setRepoUrl: wrapSetter('repoUrl'),
      setRepoInitCommand: wrapSetter('repoInitCommand'),
      openEditRepoSettings: noop,
      closeEditRepoSettings: noop,
      openPromptModal: noop,
      closePromptModal: noop,
      openWorktreeModal: noop,
      closeWorktreeModal: noop,
      setPlanModal: wrapSetter('planModal'),
      setPlanComposerModal: wrapSetter('planComposerModal'),
      openPlanComposerModal: noop,
      closePlanComposerModal: noop,
      setGitDiffModal: wrapSetter('gitDiffModal'),
      setPromptText: wrapSetter('promptText'),
      setPromptAgent: wrapSetter('promptAgent'),
      setPromptDangerousMode: wrapSetter('promptDangerousMode'),
      setPromptInputMode: wrapSetter('promptInputMode'),
      setSelectedRepo: wrapSetter('selectedRepo'),
      setShowPromptWorktreeModal: wrapSetter('showPromptWorktreeModal'),
      setShowWorktreeModal: wrapSetter('showWorktreeModal'),
      setBranchName: wrapSetter('branchName'),
      setWorktreeLaunchOption: wrapSetter('worktreeLaunchOption'),
      setLaunchDangerousMode: wrapSetter('launchDangerousMode'),
      setConfirmDelete: wrapSetter('confirmDelete'),
      setConfirmDeleteRepo: wrapSetter('confirmDeleteRepo'),
      setEditInitCommandModal: wrapSetter('editInitCommandModal'),
      closePlanModal: noop,
      planModal: state.planModal,
      planComposerModal: state.planComposerModal,
      gitDiffModal: state.gitDiffModal,
      showPromptWorktreeModal: state.showPromptWorktreeModal,
      selectedRepo: state.selectedRepo,
      promptText: state.promptText,
      promptAgent: state.promptAgent,
      promptDangerousMode: state.promptDangerousMode,
      promptInputMode: state.promptInputMode,
      showWorktreeModal: state.showWorktreeModal,
      branchName: state.branchName,
      worktreeLaunchOption: state.worktreeLaunchOption,
      launchDangerousMode: state.launchDangerousMode,
      confirmDelete: state.confirmDelete,
      confirmDeleteRepo: state.confirmDeleteRepo,
      repoUrl: state.repoUrl,
      repoInitCommand: state.repoInitCommand,
      showAddRepoModal: state.showAddRepoModal,
    }),
  };
});

vi.mock('../../hooks/useRepositoryData.js', () => ({
  useRepositoryData: () => ({
    data: {},
    activeWorktree: null,
    setActiveWorktree: noop,
    applyDataUpdate: noop,
    getRepoInitCommandValue: () => '',
  }),
}));

vi.mock('../../../terminal/hooks/useTerminalManagement.js', () => ({
  useTerminalManagement: () => ({
    terminalContainerRef: createRef(null),
    sessionId: null,
    sessionMapRef: createRef(new Map()),
    sessionKeyByIdRef: createRef(new Map()),
    openTerminal: noopAsync,
    disposeSocket: noop,
    disposeTerminal: noop,
    sendResize: noop,
  }),
}));

vi.mock('../../../terminal/hooks/useSessionManagement.js', () => ({
  useSessionManagement: () => ({
    knownSessionsRef: createRef(new Map()),
    sessionMetadataSnapshot: new Map(),
    sessionMetadataRef: createRef(new Map()),
    idleAcknowledgementsSnapshot: new Map(),
    idleAcknowledgementsRef: createRef(new Map()),
    removeTrackedSession: noop,
    syncKnownSessions: noop,
    setIdleAcknowledgementsSnapshot: noop,
  }),
}));

vi.mock('../../../github/hooks/useGitSidebar.js', () => ({
  useGitSidebar: () => ({
    isGitSidebarOpen: false,
    handleGitStatusUpdate: noop,
    toggleGitSidebar: noop,
    closeGitSidebar: noop,
  }),
}));

vi.mock('../../../tasks/hooks/useTaskManagement.js', () => ({
  useTaskManagement: () => ({
    tasks: [],
    pendingLaunchesRef: createRef(new Map()),
    loadTasks: noopAsync,
    applyTaskUpdate: noop,
  }),
}));

vi.mock('../../../tasks/hooks/usePendingTaskProcessor.js', () => ({
  usePendingTaskProcessor: () => ({
    processPendingTask: noop,
  }),
}));

vi.mock('../../../github/hooks/useDashboard.js', () => ({
  useDashboard: () => ({
    activeRepoDashboard: null,
    setActiveRepoDashboard: noop,
    dashboardData: null,
    dashboardError: null,
    isDashboardLoading: false,
    clearDashboardPolling: noop,
    dashboardCacheRef: createRef(new Map()),
    setDashboardData: noop,
    setDashboardError: noop,
    setIsDashboardLoading: noop,
    refreshDashboard: noop,
  }),
}));

vi.mock('../../../../hooks/useEventStream.js', () => ({
  useEventStream: noop,
}));

vi.mock('../../../../hooks/useCommandConfig.js', () => ({
  useCommandConfig: () => ({
    getCommandForLaunch: () => 'cmd',
  }),
}));

vi.mock('../../hooks/useRepositoryOperations.js', () => ({
  useRepositoryOperations: () => ({
    isAddingRepo: false,
    isDeletingRepo: false,
    addRepository: async () => ({ taskId: '1' }),
    updateInitCommand: noopAsync,
    deleteRepository: async (_org: string, _repo: string, cb: () => void) => cb(),
  }),
}));

vi.mock('../../../worktrees/hooks/useWorktreeOperations.js', () => ({
  useWorktreeOperations: () => ({
    isCreatingWorktree: false,
    isCreatingPromptWorktree: false,
    isDeletingWorktree: false,
    createWorktree: async () => ({ taskId: '1' }),
    deleteWorktree: noopAsync,
  }),
}));

vi.mock('../../../plans/hooks/usePlanManagement.js', () => ({
  usePlanManagement: () => ({
    isCreatingPlan: false,
    createPlanFromPrompt: noopAsync,
    fetchPlanContent: noopAsync,
    openPlanHistory: noopAsync,
  }),
}));

vi.mock('../../../github/hooks/useDiffManagement.js', () => ({
  useDiffManagement: () => ({
    autoCloseDiff: noop,
    closeDiffModal: noop,
    openGitDiff: noop,
    toggleDiffView: noop,
  }),
}));

vi.mock('../../../../hooks/usePollingEffects.js', () => ({
  usePollingEffects: () => ({
    loadSessions: noopAsync,
  }),
}));

vi.mock('../../../worktrees/hooks/useWorktreeSelection.js', () => ({
  useWorktreeSelection: () => ({
    handleWorktreeSelection: noopAsync,
  }),
}));

vi.mock('../../../../hooks/useMenuManagement.js', () => ({
  useMenuManagement: () => ({
    isMobileMenuOpen: false,
    setIsMobileMenuOpen: noop,
    closeActionMenu: noop,
    closeMobileMenu: noop,
    openActionMenu: noop,
    toggleActionMenu: noop,
    getActionMenuRef: () => null,
  }),
}));

vi.mock('../../../../hooks/useActionBar.js', () => ({
  useActionBar: () => ({
    githubControls: null,
    taskMenuButton: null,
    planHistoryButton: null,
    gitSidebarButton: null,
    portsMenuButton: null,
  }),
}));

vi.mock('../../../codex-sdk/hooks/useCodexSdkChat.js', () => ({
  useCodexSdkChat: () => ({
    sessions: [],
    activeSessionId: null,
    activeSession: null,
    events: [],
    connectionState: 'idle',
    lastError: null,
    isSending: false,
    connectionStateBySession: {},
    createSessionForWorktree: noopAsync,
    deleteSession: noopAsync,
    sendMessage: noopAsync,
    setActiveSessionId: noop,
  }),
}));

vi.mock('../../../codex-sdk/components/CodexSdkChatPanel.js', () => ({
  default: () => null,
}));

vi.mock('../../../terminal/components/MainPane.js', () => ({
  default: () => null,
}));

vi.mock('../Sidebar.js', () => ({
  default: () => null,
}));

vi.mock('../../../terminal/components/ModalContainer.js', () => ({
  default: () => null,
}));

vi.mock('../../../ports/components/PortsMenu.js', () => ({
  PortsMenu: () => null,
}));

vi.mock('../../../../services/api/terminalService.js', () => ({
  closeTerminal: noopAsync,
}));

vi.mock('../../../../services/api/api-client.js', () => ({
  isAuthenticationError: () => false,
}));

vi.mock('../../../../services/api/planModeService.js', () => ({
  listPlans: async () => [],
  createPlan: async () => createPlanDetail(),
  fetchPlan: async () => createPlanDetail(),
  ensurePlanSession: async () => ({ ...createPlanDetail(), codexSessionId: 'session-1' }),
  updatePlanMarkdown: async () => createPlanDetail(),
  updatePlanStatus: async () => createPlanDetail(),
  buildPlan: async () => ({ plan: createPlanDetail(), taskId: 't1' }),
}));

vi.mock('../../../plans/hooks/usePlanCodexSession.js', () => ({
  usePlanCodexSession: () => ({
    session: null,
    events: [],
    connectionState: 'idle' as const,
    isSending: false,
    lastError: null,
    sendMessage: noopAsync,
  }),
}));

const originalAlert = typeof window !== 'undefined' ? window.alert : (() => {});

describe('RepoBrowser plan workspace integration', () => {

  beforeEach(() => {
    if (typeof window !== 'undefined') {
      window.alert = vi.fn();
    }
  });

  afterEach(() => {
    cleanup();
    if (typeof window !== 'undefined') {
      window.alert = originalAlert as () => void;
    }
    vi.clearAllMocks();
  });

  it('renders without plan chat reference errors', async () => {
    const { default: RepoBrowser } = await import('../RepoBrowser.js');
    expect(() => render(<RepoBrowser />)).not.toThrow();
  });
});
