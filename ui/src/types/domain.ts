/**
 * Domain models and types
 */

// Repository types
export interface Repository {
  org: string;
  repo: string;
  url?: string;
  path?: string;
  worktrees?: WorktreeInfo[];
  initCommand?: string;
}

export interface RepositoryData {
  [org: string]: {
    [repo: string]: Repository;
  };
}

// Worktree types (detailed info from Git)
export interface WorktreeInfo {
  branch: string;
  path: string;
  current?: boolean;
  prunable?: boolean;
}

// Worktree context (org/repo/branch identifier)
export interface Worktree {
  org: string;
  repo: string;
  branch: string;
}

// Repository dashboard context
export interface RepoDashboard {
  org: string;
  repo: string;
}

// Task types
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Task {
  id: string;
  type: string;
  status: TaskStatus;
  org?: string;
  repo?: string;
  branch?: string;
  prompt?: string;
  createdAt?: string;
  updatedAt?: string;
  error?: string;
  result?: unknown;
  removed?: boolean;
}

// Plan types
export interface Plan {
  id: string;
  name: string;
  org: string;
  repo: string;
  createdAt: string;
  path?: string;
}

// Terminal session types
export interface WorktreeSessionTab {
  id: string;
  label: string;
  kind: 'interactive' | 'automation';
  tool: 'terminal' | 'agent';
  idle: boolean;
  usingTmux: boolean;
  lastActivityAt: string | null;
  createdAt: string | null;
  tmuxSessionName?: string | null;
}

export interface WorktreeSession {
  org: string;
  repo: string;
  branch: string;
  idle: boolean;
  lastActivityAt: string | null;
  sessions: WorktreeSessionTab[];
}

// Git status types
export interface GitFileEntry {
  path: string;
  status: string;
  previousPath?: string;
  staged?: boolean;
}

export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
  abbrevHash?: string;
}

export interface GitStatus {
  branch: string;
  ahead?: number;
  behind?: number;
  staged?: GitFileEntry[];
  unstaged?: GitFileEntry[];
  untracked?: GitFileEntry[];
  commits?: GitCommit[];
  error?: string;
}

// Issue types
export interface IssueLabel {
  name: string;
  color: string;
  description?: string;
}

export interface IssueUser {
  login: string;
  avatar_url?: string;
  html_url?: string;
}

export interface Issue {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  user?: IssueUser;
  labels?: IssueLabel[];
  assignees?: IssueUser[];
  created_at?: string;
  updated_at?: string;
  closed_at?: string;
  html_url?: string;
  comments?: number;
}

export interface IssueDetails {
  issue: Issue;
  fetchedAt: string;
}

// Dashboard types
export interface RepositoryDashboard {
  org: string;
  repo: string;
  issues?: Issue[];
  pulls?: Issue[];
  branches?: string[];
  recentCommits?: GitCommit[];
  stats?: {
    openIssues?: number;
    openPRs?: number;
    totalBranches?: number;
  };
}

// Command types
export interface Command {
  name: string;
  command: string;
  description?: string;
}

export interface Commands {
  [key: string]: Command;
}
