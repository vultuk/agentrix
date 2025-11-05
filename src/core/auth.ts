import type { IncomingMessage, ServerResponse } from 'node:http';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '../config/constants.js';
import { clearCookie, parseCookies, setCookie } from '../infrastructure/cookies/index.js';
import { generateSessionToken } from '../utils/random.js';
import type { AuthManager } from '../types/auth.js';

interface AuthError extends Error {
  statusCode: number;
}

export function createAuthManager(expectedPassword: string): AuthManager {
  const validSessionTokens = new Set<string>();

  function createError(message: string, statusCode: number): AuthError {
    const error = new Error(message) as AuthError;
    error.statusCode = statusCode;
    return error;
  }

  function getTokenFromRequest(req: IncomingMessage): string {
    const cookies = parseCookies(req.headers?.cookie);
    return cookies[SESSION_COOKIE_NAME] || '';
  }

  function isAuthenticated(req: IncomingMessage): boolean {
    const token = getTokenFromRequest(req);
    return Boolean(token && validSessionTokens.has(token));
  }

  function login(
    req: IncomingMessage,
    res: ServerResponse,
    providedPassword: string,
    options: { secure?: boolean } = {}
  ): string {
    if (typeof providedPassword !== 'string' || !providedPassword.trim()) {
      throw createError('Password is required', 400);
    }
    if (providedPassword.trim() !== expectedPassword) {
      throw createError('Invalid password', 401);
    }

    const existing = getTokenFromRequest(req);
    if (existing) {
      validSessionTokens.delete(existing);
    }

    const token = generateSessionToken();
    validSessionTokens.add(token);
    const secureFlag = options.secure;
    setCookie(res, SESSION_COOKIE_NAME, token, {
      maxAge: SESSION_MAX_AGE_SECONDS,
      sameSite: 'Strict',
      httpOnly: true,
      path: '/',
      secure: secureFlag,
    });
    return token;
  }

  function logout(req: IncomingMessage, res: ServerResponse, options: { secure?: boolean } = {}): void {
    const token = getTokenFromRequest(req);
    if (token) {
      validSessionTokens.delete(token);
    }
    clearCookie(res, SESSION_COOKIE_NAME, {
      path: '/',
      sameSite: 'Strict',
      httpOnly: true,
      secure: options?.secure,
    });
  }

  function hasToken(token: string): boolean {
    return validSessionTokens.has(token);
  }

  function clear(): void {
    validSessionTokens.clear();
  }

  return {
    login,
    logout,
    isAuthenticated,
    hasToken,
    clear,
    getTokenFromRequest,
  };
}
