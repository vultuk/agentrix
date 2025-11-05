import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Cookie options for authentication
 */
export interface CookieOptions {
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * Authentication manager interface
 */
export interface AuthManager {
  login(req: IncomingMessage, res: ServerResponse, password: string, options?: { secure?: boolean }): string;
  logout(req: IncomingMessage, res: ServerResponse, options?: { secure?: boolean }): void;
  isAuthenticated(req: IncomingMessage): boolean;
  hasToken(token: string): boolean;
  clear(): void;
  getTokenFromRequest(req: IncomingMessage): string;
}

/**
 * Cookie manager interface
 */
export interface CookieManager {
  resolveSecure(req: IncomingMessage): boolean;
}

