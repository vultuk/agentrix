export type PlanStatus = 'draft' | 'updated' | 'ready' | 'building';

export interface PlanSource {
  type: 'manual' | 'issue';
  issueNumber?: number;
  issueUrl?: string;
}

export interface PlanDiffLine {
  type: 'context' | 'added' | 'removed';
  beforeLine?: number | null;
  afterLine?: number | null;
  text: string;
}

export interface PlanDiffHunk {
  beforeStartLine: number;
  afterStartLine: number;
  lines: PlanDiffLine[];
}

export interface PlanDiffSnapshot {
  updatedAt: string;
  updatedBy: 'user' | 'codex';
  hunks: PlanDiffHunk[];
}

export interface PlanSummary {
  id: string;
  title: string;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
  slug: string;
  source: PlanSource;
  lastChange: PlanDiffSnapshot | null;
  codexSessionId: string | null;
  worktreeBranch: string | null;
}

export interface PlanDetail extends PlanSummary {
  markdown: string;
  defaultBranch: string | null;
}
