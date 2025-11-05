/**
 * Plan service type definitions
 */

export interface PlanServiceConfig {
  defaultLlm?: string;
}

export interface PlanCreateOptions {
  prompt: string;
  cwd?: string;
  rawPrompt?: boolean;
  dangerousMode?: boolean;
}

export interface PlanService {
  isConfigured: boolean;
  createPlanText(options: PlanCreateOptions): Promise<string>;
  dispose?(): Promise<void>;
}

export interface BranchNameGeneratorConfig {
  defaultLlm?: string;
}

export interface BranchNameGenerateOptions {
  prompt: string;
  org: string;
  repo: string;
}

export interface BranchNameGenerator {
  isConfigured: boolean;
  generateBranchName(options: BranchNameGenerateOptions): Promise<string>;
  dispose?(): Promise<void>;
}

