export type SessionTerminal = {
  name: string;
  type: string;
  dangerous?: boolean;
  session_id: string;
};

export type SessionWorktree = {
  name: string;
  terminals: SessionTerminal[];
};

export type SessionPlan = {
  name: string;
  session_id: string;
  related_issue?: number;
};

export type SessionRepository = {
  name: string;
  plans: SessionPlan[];
  worktrees: SessionWorktree[];
};

export type SessionWorkspace = {
  name: string;
  repositories: SessionRepository[];
};

export type ApiResponse<T> = {
  data: T;
  message?: string;
};

