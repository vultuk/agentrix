import { useState, useCallback, useMemo } from 'react';
import { renderMarkdown } from '../../utils/markdown.js';
import * as plansService from '../../services/api/plansService.js';
import type { Plan } from '../../types/domain.js';

interface PlanModalState {
  open: boolean;
  loading: boolean;
  error: string | null;
  plans: Plan[];
  selectedPlanId: string | null;
  content: string;
  contentLoading: boolean;
  contentError: string | null;
  context: string | null;
}

const createEmptyPlanModalState = (): PlanModalState => ({
  open: false,
  loading: false,
  error: null,
  plans: [],
  selectedPlanId: null,
  content: '',
  contentLoading: false,
  contentError: null,
  context: null
});

interface UsePlansReturn {
  planModal: PlanModalState;
  setPlanModal: (state: PlanModalState | ((prev: PlanModalState) => PlanModalState)) => void;
  isCreatingPlan: boolean;
  setIsCreatingPlan: (creating: boolean) => void;
  handleClosePlanModal: () => void;
  fetchPlanContent: (context: string, planId: string) => Promise<void>;
  openPlanHistory: (org: string, repo: string) => Promise<void>;
  handleSelectPlan: (planId: string) => void;
  selectedPlan: Plan | null;
  planModalContentHtml: string;
  createEmptyPlanModalState: () => PlanModalState;
}

/**
 * Custom hook for managing plans state and operations
 */
export function usePlans(): UsePlansReturn {
  const [planModal, setPlanModal] = useState<PlanModalState>(() => createEmptyPlanModalState());
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);

  const handleClosePlanModal = useCallback(() => {
    setPlanModal(createEmptyPlanModalState());
  }, []);

  const fetchPlanContent = useCallback(
    async (context: string, planId: string): Promise<void> => {
      if (!context || !planId) {
        return;
      }

      const [org, repo] = context.split('/');
      if (!org || !repo) {
        return;
      }

      setPlanModal((current) => ({
        ...current,
        contentLoading: true,
        contentError: null,
      }));

      try {
        const content = await plansService.fetchPlan(org, repo, planId);
        setPlanModal((current) => ({
          ...current,
          content,
          contentLoading: false,
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load plan content';
        setPlanModal((current) => ({
          ...current,
          contentError: message,
          contentLoading: false,
        }));
      }
    },
    [],
  );

  const openPlanHistory = useCallback(async (org: string, repo: string): Promise<void> => {
    if (!org || !repo) {
      return;
    }

    const context = `${org}/${repo}`;
    setPlanModal({
      ...createEmptyPlanModalState(),
      open: true,
      loading: true,
      context,
    });

    try {
      const plans = await plansService.fetchPlans(org, repo);
      setPlanModal((current) => ({
        ...current,
        plans: Array.isArray(plans) ? plans : [],
        loading: false,
        error: null,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load plans';
      setPlanModal((current) => ({
        ...current,
        error: message,
        loading: false,
      }));
    }
  }, []);

  const handleSelectPlan = useCallback(
    (planId: string) => {
      setPlanModal((current) => ({ ...current, selectedPlanId: planId }));
      if (!planId || !planModal.context) {
        return;
      }
      fetchPlanContent(planModal.context, planId);
    },
    [fetchPlanContent, planModal.context]
  );

  const selectedPlan = useMemo(
    () => planModal.plans.find((plan) => plan.id === planModal.selectedPlanId) || null,
    [planModal.plans, planModal.selectedPlanId]
  );

  const planModalContentHtml = useMemo(
    () => (planModal.content ? renderMarkdown(planModal.content) : ''),
    [planModal.content]
  );

  return {
    planModal,
    setPlanModal,
    isCreatingPlan,
    setIsCreatingPlan,
    handleClosePlanModal,
    fetchPlanContent,
    openPlanHistory,
    handleSelectPlan,
    selectedPlan,
    planModalContentHtml,
    createEmptyPlanModalState,
  };
}

