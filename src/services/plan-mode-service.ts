import { ensureRepository, listWorktrees } from '../core/git.js';
import { selectDefaultBranchOverride, resolveDefaultBranch } from '../core/default-branch.js';
import {
  createPlan,
  deletePlan,
  listPlans,
  readPlan,
  updatePlan,
  type PlanRecord,
  type PlanSource,
  type PlanStatus,
} from '../core/plan-mode-store.js';
import type { WorktreeService } from './worktree-service.js';
import {
  createCodexSdkSession,
  sendCodexSdkUserMessage,
  subscribeToCodexSdkEvents,
} from '../core/codex-sdk-sessions.js';
import { NotFoundError } from '../infrastructure/errors/not-found-error.js';

const PLAN_START_TAG = '<start-plan>';
const PLAN_END_TAG = '<end-plan>';

interface PlanModeServiceConfig {
  workdir: string;
  defaultBranches?: unknown;
  worktreeService: WorktreeService;
}

interface PlanCreateOptions {
  org: string;
  repo: string;
  title: string;
  markdown: string;
  source: PlanSource;
  seedDescription?: string;
}

interface PlanUpdateOptions {
  org: string;
  repo: string;
  id: string;
  markdown: string;
  updatedBy: 'user' | 'codex';
}

interface PlanGenerationContext {
  title?: string;
  description: string;
  issueNumber?: number;
  issueUrl?: string;
}

interface PlanBuildResult {
  plan: PlanRecord;
  taskId: string;
}

function normalisePlanMarkdown(text: string): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    return '';
  }
  const taggedMatch = new RegExp(`${PLAN_START_TAG}([\\s\\S]+?)${PLAN_END_TAG}`, 'i').exec(trimmed);
  if (taggedMatch && taggedMatch[1]) {
    return taggedMatch[1].trim();
  }
  const fenced = /^```[a-zA-Z0-9-]*\s*([\s\S]+?)```$/m.exec(trimmed);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  return trimmed;
}

export class PlanModeService {
  private readonly workdir: string;
  private readonly defaultBranchConfig?: unknown;
  private readonly worktreeService: WorktreeService;
  private readonly sessionSubscriptions = new Map<string, () => void>();

  constructor({ workdir, defaultBranches, worktreeService }: PlanModeServiceConfig) {
    this.workdir = workdir;
    this.defaultBranchConfig = defaultBranches;
    this.worktreeService = worktreeService;
  }

  async list(org: string, repo: string): Promise<PlanRecord[]> {
    const plans = await listPlans({ workdir: this.workdir, org, repo });
    plans.forEach((plan) => {
      if (plan.codexSessionId) {
        this.attachSessionListener(plan);
      }
    });
    return plans;
  }

  async read(org: string, repo: string, id: string): Promise<PlanRecord | null> {
    const plan = await readPlan({ workdir: this.workdir, org, repo, id });
    if (plan?.codexSessionId) {
      this.attachSessionListener(plan);
    }
    return plan;
  }

  async create(options: PlanCreateOptions): Promise<PlanRecord> {
    const defaultBranch = await this.resolveDefaultBranch(options.org, options.repo);
    const plan = await createPlan(
      { workdir: this.workdir, org: options.org, repo: options.repo },
      {
        title: options.title,
        markdown: options.markdown,
        source: options.source,
        defaultBranch,
      },
    );
    const seedDescription = options.seedDescription ?? options.markdown;
    if (seedDescription?.trim()) {
      const generationContext: PlanGenerationContext = {
        title: options.title,
        description: seedDescription,
        issueNumber: options.source.type === 'issue' ? options.source.issueNumber : undefined,
        issueUrl: options.source.type === 'issue' ? options.source.issueUrl : undefined,
      };
      this.scheduleInitialGeneration(plan, generationContext);
    }
    return plan;
  }

  async updateMarkdown(options: PlanUpdateOptions): Promise<PlanRecord> {
    try {
      return await updatePlan(
        { workdir: this.workdir, org: options.org, repo: options.repo, id: options.id },
        { markdown: options.markdown, updatedBy: options.updatedBy },
      );
    } catch (error) {
      this.handlePlanUpdateError(error);
      throw error;
    }
  }

  async setStatus(
    org: string,
    repo: string,
    id: string,
    status: PlanStatus,
  ): Promise<PlanRecord> {
    try {
      return await updatePlan(
        { workdir: this.workdir, org, repo, id },
        { status },
      );
    } catch (error) {
      this.handlePlanUpdateError(error);
      throw error;
    }
  }

  async ensureSession(org: string, repo: string, id: string): Promise<PlanRecord> {
    let plan = await this.read(org, repo, id);
    if (!plan) {
      throw new NotFoundError('Plan');
    }
    if (plan.codexSessionId) {
      this.attachSessionListener(plan);
      return plan;
    }
    const branch = await this.resolveDefaultBranch(org, repo);
    const { summary } = await createCodexSdkSession({
      workdir: this.workdir,
      org,
      repo,
      branch,
      label: `Plan · ${plan.title}`,
    });
    plan = await updatePlan(
      { workdir: this.workdir, org, repo, id },
      {
        codexSessionId: summary.id,
        defaultBranch: branch,
      },
    );
    this.attachSessionListener(plan);
    return plan;
  }

  async buildPlan(org: string, repo: string, id: string): Promise<PlanBuildResult> {
    const plan = await this.read(org, repo, id);
    if (!plan) {
      throw new NotFoundError('Plan');
    }
    if (plan.status !== 'ready' && plan.status !== 'draft') {
      throw new Error('Plan is not ready to build');
    }
    const branch = await this.generateWorktreeBranch(plan);
    const locked = await updatePlan(
      { workdir: this.workdir, org, repo, id },
      { status: 'building', worktreeBranch: branch },
    );
    const task = await this.worktreeService.createWorktree({
      org,
      repo,
      branch,
      prompt: plan.markdown,
      hasPrompt: Boolean(plan.markdown),
    });
    await deletePlan({ workdir: this.workdir, org, repo, id });
    if (plan.codexSessionId) {
      this.detachSessionListener(plan.codexSessionId);
    }
    return { plan: locked, taskId: task.taskId };
  }

  async delete(org: string, repo: string, id: string): Promise<void> {
    const plan = await this.read(org, repo, id);
    if (!plan) {
      throw new NotFoundError('Plan');
    }
    await deletePlan({ workdir: this.workdir, org, repo, id });
    if (plan.codexSessionId) {
      this.detachSessionListener(plan.codexSessionId);
    }
  }

  private async resolveDefaultBranch(org: string, repo: string): Promise<string> {
    const { repositoryPath } = await ensureRepository(this.workdir, org, repo);
    const override = selectDefaultBranchOverride(this.defaultBranchConfig, org, repo);
    return resolveDefaultBranch(repositoryPath, { override });
  }

  private async generateWorktreeBranch(plan: PlanRecord): Promise<string> {
    const base = `feature/${plan.slug}`;
    let candidate = base;
    let suffix = 2;
    while (await this.branchExists(plan.org, plan.repo, candidate)) {
      candidate = `${base}-${suffix++}`;
    }
    return candidate;
  }

  private async branchExists(org: string, repo: string, branch: string): Promise<boolean> {
    try {
      const { repositoryPath } = await ensureRepository(this.workdir, org, repo);
      const worktrees = await listWorktrees(repositoryPath);
      return worktrees.some((entry) => entry.branch === branch);
    } catch {
      return false;
    }
  }

  private handlePlanUpdateError(error: unknown): never {
    if (error instanceof Error && /Plan not found/i.test(error.message)) {
      throw new NotFoundError('Plan', error);
    }
    throw error;
  }

  private attachSessionListener(plan: PlanRecord): void {
    const sessionId = plan.codexSessionId;
    if (!sessionId || this.sessionSubscriptions.has(sessionId)) {
      return;
    }
    try {
      const unsubscribe = subscribeToCodexSdkEvents(sessionId, (event) => {
        if (event.type === 'agent_response' && event.text && plan.id) {
          const markdown = normalisePlanMarkdown(event.text);
          if (!markdown) {
            return;
          }
          updatePlan(
            { workdir: this.workdir, org: plan.org, repo: plan.repo, id: plan.id },
            { markdown, updatedBy: 'codex' },
          ).catch((error) => {
            console.warn('[agentrix] Failed to persist plan update from Codex:', error);
          });
        }
      });
      this.sessionSubscriptions.set(sessionId, unsubscribe);
    } catch (error: unknown) {
      if (error instanceof Error && /Codex SDK session not found/i.test(error.message)) {
        void this.recreatePlanSession(plan);
        return;
      }
      throw error;
    }
  }

  private detachSessionListener(sessionId: string): void {
    const unsubscribe = this.sessionSubscriptions.get(sessionId);
    if (unsubscribe) {
      this.sessionSubscriptions.delete(sessionId);
      try {
        unsubscribe();
      } catch {
        // ignore unsubscribe errors
      }
    }
  }

  private async recreatePlanSession(plan: PlanRecord): Promise<void> {
    try {
      const branch = plan.defaultBranch || (await this.resolveDefaultBranch(plan.org, plan.repo));
      const { summary } = await createCodexSdkSession({
        workdir: this.workdir,
        org: plan.org,
        repo: plan.repo,
        branch,
        label: `Plan · ${plan.title}`,
      });
      const refreshed = await updatePlan(
        { workdir: this.workdir, org: plan.org, repo: plan.repo, id: plan.id },
        { codexSessionId: summary.id, defaultBranch: branch },
      );
      this.attachSessionListener(refreshed);
    } catch (error) {
      console.warn('[agentrix] Failed to recreate Codex session for plan:', error);
    }
  }

  private scheduleInitialGeneration(plan: PlanRecord, context: PlanGenerationContext): void {
    const trimmed = context.description.trim();
    if (!trimmed) {
      return;
    }
    const run = async () => {
      try {
        await this.generateInitialPlan(plan, { ...context, description: trimmed });
      } catch (error) {
        console.warn('[agentrix] Failed to auto-generate plan via Codex:', error);
      }
    };
    void run();
  }

  private async generateInitialPlan(plan: PlanRecord, context: PlanGenerationContext): Promise<void> {
    const sessionPlan = await this.ensureSession(plan.org, plan.repo, plan.id);
    const sessionId = sessionPlan.codexSessionId;
    if (!sessionId) {
      return;
    }
    const promptParts = [
      `You are the lead engineer writing a delivery-ready plan for ${plan.org}/${plan.repo}.`,
      'Transform the description below into a single canonical planning doc using true Markdown headings (e.g., `#`, `##`, `###`).',
      'Required outline:',
      '# Overview',
      '   - one paragraph summary + explicit success criteria.',
      '# Scope & Constraints',
      '   - numbered bullets of in-scope items, out-of-scope items, APIs/infra assumptions.',
      '# Implementation Plan',
      '   - for each subsystem (Backend, Frontend, Mobile, Tooling, etc.) use `## <Subsystem>` headings containing:',
      '     * ordered steps written with imperative verbs.',
      '     * callouts for files/modules likely touched.',
      '     * notes about shared helpers or feature flags.',
      '# Testing & Validation',
      '   - subsections for Automated, Manual QA, Telemetry.',
      '# Risks & Mitigations',
      '   - Markdown table with columns Risk / Impact / Mitigation.',
      '# Done Checklist',
      '   - checkbox list engineers tick as they ship.',
      '',
      `Enclose the final document between the literal tags "${PLAN_START_TAG}" and "${PLAN_END_TAG}" (no additional text outside the tags).`,
      'Do not wrap the plan in triple backticks or include extra commentary outside the tagged block.',
      '',
      'Ground everything in the repository context and keep formatting to GitHub-flavoured markdown.',
      'Ensure the plan is specific enough that another engineer can begin coding immediately.',
    ];

    promptParts.push('');
    promptParts.push('Feature description:');
    if (context.issueNumber) {
      const issueLine = context.issueUrl
        ? `Issue #${context.issueNumber}: ${context.issueUrl}`
        : `Issue #${context.issueNumber}`;
      promptParts.push(issueLine);
    }
    if (context.title) {
      promptParts.push(`Title: ${context.title}`);
    }
    promptParts.push(context.description);
    const prompt = promptParts.join('\n');
    await sendCodexSdkUserMessage(sessionId, prompt);
  }
}

export function createPlanModeService(config: PlanModeServiceConfig): PlanModeService {
  return new PlanModeService(config);
}
