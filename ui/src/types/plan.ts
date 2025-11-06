/**
 * Type definitions for plan modal state
 */

export interface PlanHistoryEntry {
  id: string;
  branch: string;
  createdAt: string;
}

export interface PlanModalContext {
  org: string;
  repo: string;
  branch?: string;
}

export interface PlanModalState {
  open: boolean;
  loading: boolean;
  error: string | null;
  plans: PlanHistoryEntry[];
  selectedPlanId: string | null;
  content: string;
  contentLoading: boolean;
  contentError: string | null;
  context: PlanModalContext | null;
}

export function createEmptyPlanModalState(): PlanModalState {
  return {
    open: false,
    loading: false,
    error: null,
    plans: [],
    selectedPlanId: null,
    content: '',
    contentLoading: false,
    contentError: null,
    context: null
  };
}
