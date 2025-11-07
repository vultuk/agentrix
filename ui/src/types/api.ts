/**
 * API request and response types
 */

import type {
  Commands,
  IssueDetails,
  Plan,
  RepositoryData,
  RepositoryDashboard,
  Task,
  WorktreeSession,
  GitStatus,
} from './domain.js';

// Generic API response
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
}

// Auth API
export interface LoginRequest {
  password: string;
}

export interface AuthStatusResponse {
  authenticated: boolean;
}

// Repository API
export interface FetchRepositoriesResponse {
  data: RepositoryData;
}

export interface AddRepositoryRequest {
  url: string;
  initCommand?: string;
}

export interface AddRepositoryResponse {
  data: RepositoryData;
  repo: {
    org: string;
    repo: string;
  } | null;
}

export interface DeleteRepositoryRequest {
  org: string;
  repo: string;
}

export interface UpdateInitCommandRequest {
  org: string;
  repo: string;
  initCommand: string;
}

export interface FetchRepositoryDashboardResponse {
  data: RepositoryDashboard | null;
}

export interface FetchIssueResponse {
  data: IssueDetails;
}

export interface FetchCommandsResponse {
  commands: Commands | null;
}

// Worktree API
export interface CreateWorktreeRequest {
  org: string;
  repo: string;
  branch?: string | null;
  prompt?: string | null;
}

export interface CreateWorktreeResponse {
  taskId: string;
  [key: string]: unknown;
}

export interface DeleteWorktreeRequest {
  org: string;
  repo: string;
  branch: string;
}

// Task API
export interface FetchTasksResponse {
  tasks: Task[];
}

export interface CreateTaskRequest {
  type: string;
  org?: string;
  repo?: string;
  branch?: string;
  prompt?: string;
  [key: string]: unknown;
}

// Plan API
export interface FetchPlansResponse {
  data: Array<{
    id: string;
    branch: string;
    createdAt: string;
  }>;
}

export interface FetchPlanContentResponse {
  data: {
    id: string;
    branch: string;
    createdAt: string;
    content: string;
  };
}

export interface CreatePlanRequest {
  org: string;
  repo: string;
  name: string;
  content: string;
}

export interface CreatePlanFromPromptRequest {
  prompt: string;
  org: string;
  repo: string;
  rawPrompt?: boolean;
  dangerousMode?: boolean;
}

export interface CreatePlanFromPromptResponse {
  plan: string;
}

// Git API
export interface FetchGitStatusResponse {
  status: GitStatus;
}

export interface FetchDiffRequest {
  org: string;
  repo: string;
  branch: string;
  path: string;
  previousPath?: string | null;
  mode?: string;
  status?: string;
}

export interface FetchDiffResponse {
  diff: {
    diff: string;
    path?: string;
    previousPath?: string | null;
    mode?: string;
    status?: string;
  };
}

export interface DiffData {
  diff: string;
  path: string;
  previousPath: string | null;
  mode: string;
  status: string;
}

// Terminal API
export interface OpenTerminalRequest {
  org: string;
  repo: string;
  branch: string;
  command?: string | null;
  prompt?: string | null;
  sessionId?: string | null;
  newSession?: boolean;
  sessionTool?: 'terminal' | 'agent';
}

export interface OpenTerminalResponse {
  sessionId: string;
  log: string;
  closed: boolean;
  created: boolean;
}

export interface FetchSessionsResponse {
  sessions: WorktreeSession[];
}

// Events API (SSE)
export interface EventStreamCallbacks {
  onRepos?: (data: RepositoryData) => void;
  onSessions?: (data: { sessions: WorktreeSession[] }) => void;
  onTasks?: (data: Task[]) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}
