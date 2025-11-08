/**
 * Hook return types and parameters
 */

import type { IssueDetails, RepositoryData, Task, WorktreeSession } from './domain.js';

// useAuth hook
export interface UseAuthReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<boolean>;
  checkSession: () => Promise<boolean>;
  handleAuthExpired: () => void;
  setIsAuthenticated: (value: boolean) => void;
}

// useWorktrees hook
export interface UseWorktreesReturn {
  isCreating: boolean;
  isDeleting: boolean;
  error: string | null;
  createWorktree: (org: string, repo: string, branch?: string | null, prompt?: string | null) => Promise<{ taskId: string }>;
  deleteWorktree: (org: string, repo: string, branch: string) => Promise<void>;
}

// useTasks hook
export interface UseTasksReturn {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  refreshTasks: () => Promise<void>;
  createTask: (taskData: unknown) => Promise<Task>;
}

// usePlans hook
export interface UsePlansReturn {
  plans: unknown[];
  isLoading: boolean;
  error: string | null;
  refreshPlans: () => Promise<void>;
  createPlan: (org: string, repo: string, name: string, content: string) => Promise<unknown>;
  createPlanFromPrompt: (prompt: string, org: string, repo: string, rawPrompt?: boolean, dangerousMode?: boolean) => Promise<string>;
  deletePlan: (org: string, repo: string, planId: string) => Promise<boolean>;
}

// useTerminal hook
export interface UseTerminalReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  terminalRef: React.RefObject<HTMLDivElement>;
  openTerminal: (org: string, repo: string, branch: string, command?: string) => Promise<void>;
  closeTerminal: () => void;
}

// useEventStream hook
export interface UseEventStreamParams {
  onRepos?: (data: RepositoryData) => void;
  onSessions?: (payload: { sessions: WorktreeSession[] }) => void;
  onTasks?: (tasks: Task[]) => void;
}

export interface UseEventStreamReturn {
  isConnected: boolean;
}

// useIssueDetails hook
export interface UseIssueDetailsParams {
  org: string;
  repo: string;
  issueNumber: number | null;
  enabled?: boolean;
}

export interface UseIssueDetailsReturn {
  issue: IssueDetails | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// usePolling hook
export interface UsePollingParams<T> {
  fetchFn: () => Promise<T>;
  interval?: number;
  enabled?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

export interface UsePollingReturn<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// useLocalStorage hook
export interface UseLocalStorageReturn<T> {
  value: T;
  setValue: (value: T | ((prev: T) => T)) => void;
  removeValue: () => void;
}

// useDebounce hook - no return type needed, just returns the debounced value
