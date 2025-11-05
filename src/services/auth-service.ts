import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthManager, CookieManager } from '../types/auth.js';
import type { IAuthService } from '../types/services.js';

/**
 * Service for authentication business logic
 * 
 * Note: Most auth logic is already well-encapsulated in core/auth.ts.
 * This service provides a thin wrapper for consistency with other services.
 */

export interface AuthResult {
  authenticated: boolean;
}

/**
 * Service for authentication operations
 */
export class AuthService implements IAuthService {
  constructor(
    private readonly authManager: AuthManager,
    private readonly cookieManager?: CookieManager
  ) {}

  /**
   * Authenticates a user
   * @param req - HTTP request
   * @param res - HTTP response
   * @param password - Password to validate
   * @returns Authentication result
   */
  async login(req: IncomingMessage, res: ServerResponse, password: string): Promise<AuthResult> {
    const secure = this.cookieManager ? this.cookieManager.resolveSecure(req) : false;
    this.authManager.login(req, res, password, { secure });
    return { authenticated: true };
  }

  /**
   * Logs out a user
   * @param req - HTTP request
   * @param res - HTTP response
   * @returns Authentication result
   */
  async logout(req: IncomingMessage, res: ServerResponse): Promise<AuthResult> {
    const secure = this.cookieManager ? this.cookieManager.resolveSecure(req) : false;
    this.authManager.logout(req, res, { secure });
    return { authenticated: false };
  }

  /**
   * Checks authentication status
   * @param req - HTTP request
   * @returns Authentication status
   */
  async getStatus(req: IncomingMessage): Promise<AuthResult> {
    const authenticated = this.authManager.isAuthenticated(req);
    return { authenticated };
  }
}

/**
 * Creates an auth service instance
 * @param authManager - Auth manager instance
 * @param cookieManager - Cookie manager instance
 * @returns AuthService instance
 */
export function createAuthService(
  authManager: AuthManager,
  cookieManager?: CookieManager
): AuthService {
  return new AuthService(authManager, cookieManager);
}
