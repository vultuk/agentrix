import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RepositoriesData, AddRepositoryResult } from '../services/repository-service.js';
import type { CreateWorktreeResult } from '../services/worktree-service.js';
import type { TerminalOpenResult, TerminalSendResult, TerminalCloseResult } from '../services/terminal-service.js';
import type { AuthResult } from '../services/auth-service.js';
import type {
  WorktreeCreateInput,
  WorktreeDeleteInput,
  TerminalOpenInput,
  TerminalSendInput,
  TerminalCloseInput,
} from '../validation/index.js';

/**
 * Interface for repository service operations
 */
export interface IRepositoryService {
  /**
   * Lists all repositories
   * @returns Repository data
   */
  listRepositories(): Promise<RepositoriesData>;

  /**
   * Adds a new repository
   * @param repositoryUrl - Git repository URL
   * @param initCommand - Optional init command
   * @returns Result with repository data
   */
  addRepository(repositoryUrl: string, initCommand?: string): Promise<AddRepositoryResult>;

  /**
   * Removes a repository
   * @param org - Organization name
   * @param repo - Repository name
   * @returns Updated repository data
   */
  deleteRepository(org: string, repo: string): Promise<RepositoriesData>;

  /**
   * Updates the init command for a repository
   * @param org - Organization name
   * @param repo - Repository name
   * @param initCommand - New init command
   * @returns Updated repository data
   */
  updateInitCommand(org: string, repo: string, initCommand: string): Promise<RepositoriesData>;
}

/**
 * Interface for worktree service operations
 */
export interface IWorktreeService {
  /**
   * Creates a new worktree
   * @param params - Creation parameters
   * @returns Result with task ID and repository info
   */
  createWorktree(params: WorktreeCreateInput): Promise<CreateWorktreeResult>;

  /**
   * Deletes a worktree
   * @param params - Deletion parameters
   * @returns Updated repository data
   */
  deleteWorktree(params: WorktreeDeleteInput): Promise<RepositoriesData>;
}

/**
 * Interface for terminal service operations
 */
export interface ITerminalService {
  /**
   * Opens or creates a terminal session
   * @param params - Session parameters
   * @returns Session information
   */
  openTerminal(params: TerminalOpenInput): Promise<TerminalOpenResult>;

  /**
   * Sends input to a terminal session
   * @param params - Input parameters
   * @returns Success result
   */
  sendInput(params: TerminalSendInput): Promise<TerminalSendResult>;

  /**
   * Closes an active terminal session
   * @param params - Close parameters
   * @returns Success result
   */
  closeSession(params: TerminalCloseInput): Promise<TerminalCloseResult>;
}

/**
 * Interface for authentication service operations
 */
export interface IAuthService {
  /**
   * Authenticates a user
   * @param req - HTTP request
   * @param res - HTTP response
   * @param password - Password to validate
   * @returns Authentication result
   */
  login(req: IncomingMessage, res: ServerResponse, password: string): Promise<AuthResult>;

  /**
   * Logs out a user
   * @param req - HTTP request
   * @param res - HTTP response
   * @returns Authentication result
   */
  logout(req: IncomingMessage, res: ServerResponse): Promise<AuthResult>;

  /**
   * Checks authentication status
   * @param req - HTTP request
   * @returns Authentication status
   */
  getStatus(req: IncomingMessage): Promise<AuthResult>;
}
