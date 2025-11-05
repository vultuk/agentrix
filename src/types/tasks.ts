/**
 * Task system type definitions
 */

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface TaskMetadata {
  [key: string]: unknown;
}

export interface TaskStep {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  message?: string;
  logs?: string[];
}

export interface TaskProgress {
  ensureStep(id: string, label: string): void;
  startStep(id: string, options: { label: string; message: string }): void;
  completeStep(id: string, options: { label: string; message: string }): void;
  failStep(id: string, options: { label: string; message: string }): void;
  skipStep(id: string, options: { label: string; message: string }): void;
  logStep(id: string, message: string): void;
}

export interface TaskContext {
  progress: TaskProgress;
  updateMetadata(metadata: TaskMetadata): void;
  setResult(result: unknown): void;
}

export type TaskExecutor = (context: TaskContext) => Promise<void>;

export interface TaskDefinition {
  type: string;
  title: string;
  metadata?: TaskMetadata;
}

export interface Task {
  id: string;
  type: string;
  title: string;
  status: TaskStatus;
  metadata: TaskMetadata;
  steps: TaskStep[];
  result?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TaskSnapshot {
  tasks: Task[];
  version: number;
}

export interface PersistenceConfig {
  loadSnapshot(): Promise<TaskSnapshot | null>;
  saveSnapshot(snapshot: TaskSnapshot): Promise<void>;
  logger?: Console;
}

