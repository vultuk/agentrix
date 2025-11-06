/**
 * Hook for managing plan creation and viewing
 */

import { useCallback, useState } from 'react';
import { flushSync } from 'react-dom';
import * as plansService from '../../../services/api/plansService.js';
import { isAuthenticationError } from '../../../services/api/api-client.js';
import { createEmptyPlanModalState } from '../../../types/plan.js';
import type { PlanModalState, PlanModalContext, PlanHistoryEntry } from '../../../types/plan.js';
import type { Worktree } from '../../../types/domain.js';

interface UsePlanManagementOptions {
  onAuthExpired?: () => void;
}

export function usePlanManagement({ onAuthExpired }: UsePlanManagementOptions = {}) {
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);

  const createPlanFromPrompt = useCallback(
    async (
      promptValue: string,
      org: string,
      repo: string,
      {
        restorePromptOnError = true,
        rawPrompt = false,
        dangerousMode = false,
        onPromptChange,
      }: {
        restorePromptOnError?: boolean;
        rawPrompt?: boolean;
        dangerousMode?: boolean;
        onPromptChange?: (value: string) => void;
      } = {},
    ) => {
      if (isCreatingPlan) {
        return;
      }
      const originalPrompt = typeof promptValue === 'string' ? promptValue : '';
      if (!originalPrompt.trim()) {
        return;
      }
      if (!org || !repo) {
        window.alert('Select a repository before creating a plan.');
        return;
      }

      setIsCreatingPlan(true);

      try {
        if (onPromptChange) {
          flushSync(() => {
            onPromptChange('');
          });
        }

        const planText = await plansService.createPlanFromPrompt(
          originalPrompt,
          org,
          repo,
          rawPrompt,
          dangerousMode
        );

        if (onPromptChange) {
          flushSync(() => {
            onPromptChange(planText);
          });
        }
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          if (restorePromptOnError && onPromptChange) {
            flushSync(() => {
              onPromptChange(promptValue);
            });
          }
          if (onAuthExpired) {
            onAuthExpired();
          }
          return;
        }
        console.error('Failed to create plan', error);
        if (restorePromptOnError && onPromptChange) {
          flushSync(() => {
            onPromptChange(promptValue);
          });
        }
        window.alert('Failed to create plan. Check server logs for details.');
      } finally {
        setIsCreatingPlan(false);
      }
    },
    [isCreatingPlan, onAuthExpired],
  );

  const fetchPlanContent = useCallback(
    async (
      context: { org: string; repo: string; branch: string },
      planId: string,
      setPlanModal: (
        state: PlanModalState | ((current: PlanModalState) => PlanModalState)
      ) => void,
    ) => {
      if (!context || !planId) {
        return;
      }

      setPlanModal((current) => ({
        ...current,
        selectedPlanId: planId,
        content: '',
        contentLoading: true,
        contentError: null
      }));

      try {
        const content = await plansService.fetchPlan(
          context.org,
          context.repo,
          context.branch,
          planId
        );
        setPlanModal((current) => ({
          ...current,
          content,
          contentLoading: false,
          contentError: null
        }));
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          if (onAuthExpired) {
            onAuthExpired();
          }
          setPlanModal((current) => ({
            ...current,
            open: false,
          }));
          return;
        }
        setPlanModal((current) => ({
          ...current,
          contentLoading: false,
          contentError: error?.message || 'Failed to load plan.'
        }));
      }
    },
    [onAuthExpired]
  );

  const openPlanHistory = useCallback(
    async (
      activeWorktree: Worktree | null,
      setPlanModal: (
        state: PlanModalState | ((current: PlanModalState) => PlanModalState)
      ) => void,
      fetchPlanContentFn: (context: PlanModalContext & { branch: string }, planId: string) => Promise<void>,
    ) => {
      if (!activeWorktree) {
        return;
      }

      const context = {
        org: activeWorktree.org,
        repo: activeWorktree.repo,
        branch: activeWorktree.branch
      };

      setPlanModal({
        ...createEmptyPlanModalState(),
        open: true,
        loading: true,
        context
      });

      try {
        const plans: PlanHistoryEntry[] = await plansService.fetchPlans(
          context.org,
          context.repo,
          context.branch
        );
        setPlanModal((current) => ({
          ...current,
          loading: false,
          error: null,
          plans,
          context
        }));
        if (plans.length > 0) {
          await fetchPlanContentFn(context, plans[0].id);
        } else {
          setPlanModal((current) => ({
            ...current,
            selectedPlanId: null,
            content: ''
          }));
        }
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          if (onAuthExpired) {
            onAuthExpired();
          }
          setPlanModal((current) => ({
            ...current,
            open: false,
          }));
          return;
        }
        setPlanModal((current) => ({
          ...current,
          loading: false,
          error: (error as any)?.message || 'Failed to load plans.'
        }));
      }
    },
    [onAuthExpired],
  );

  return {
    isCreatingPlan,
    createPlanFromPrompt,
    fetchPlanContent,
    openPlanHistory,
  };
}
