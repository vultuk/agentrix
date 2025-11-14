import { getClientIp, sendJson } from '../utils/http.js';
import { createAuthService } from '../services/index.js';
import { asyncHandler } from '../infrastructure/errors/index.js';
import { createSimpleHandler } from './base-handler.js';
import { createRateLimiter } from '../core/security/rate-limiter.js';
import { createLogger } from '../infrastructure/logging/index.js';
import {
  AUTH_RATE_LIMIT_MAX_ATTEMPTS,
  AUTH_RATE_LIMIT_WINDOW_MS,
  ERROR_MESSAGES,
  HTTP_STATUS,
} from '../config/constants.js';
import type { RateLimiter } from '../core/security/rate-limiter.js';
import type { Logger } from '../infrastructure/logging/index.js';
import type { RequestContext } from '../types/http.js';
import type { AuthManager, CookieManager } from '../types/auth.js';

interface AuthDependencies {
  createAuthService: typeof createAuthService;
  sendJson: typeof sendJson;
  createRateLimiter: typeof createRateLimiter;
  createLogger: typeof createLogger;
}

const defaultDependencies: AuthDependencies = {
  createAuthService,
  sendJson,
  createRateLimiter,
  createLogger,
};

let activeDependencies: AuthDependencies = { ...defaultDependencies };

interface AuthHandlersOptions {
  cookieManager?: CookieManager;
  rateLimiter?: RateLimiter;
  logger?: Logger;
}

/**
 * @internal Test hook to override auth handler dependencies
 */
export function __setAuthTestOverrides(overrides?: Partial<AuthDependencies>): void {
  if (!overrides) {
    activeDependencies = { ...defaultDependencies };
    return;
  }
  activeDependencies = { ...activeDependencies, ...overrides } as AuthDependencies;
}

export function createAuthHandlers(authManager: AuthManager, options: AuthHandlersOptions = {}) {
  const { cookieManager, rateLimiter, logger } = options;
  const authService = activeDependencies.createAuthService(authManager, cookieManager);
  const log = activeDependencies.createLogger(logger);
  const loginRateLimiter =
    rateLimiter ||
    activeDependencies.createRateLimiter({
      windowMs: AUTH_RATE_LIMIT_WINDOW_MS,
      maxAttempts: AUTH_RATE_LIMIT_MAX_ATTEMPTS,
    });

  // Login requires special error handling for status codes
  const login = asyncHandler(async (context: RequestContext) => {
    const payload = await context.readJsonBody();
    const password = typeof payload['password'] === 'string' ? payload['password'].trim() : '';
    const username = typeof payload['username'] === 'string' ? payload['username'].trim() : '';
    const clientIp = getClientIp(context.req);
    const limiterKey = clientIp;

    const limiterStatus = loginRateLimiter.check(limiterKey);
    if (limiterStatus.limited) {
      log.warn('[agentrix] Login attempt throttled', {
        clientIp,
        username: username || 'n/a',
        attempts: limiterStatus.attempts,
        retryAfterMs: limiterStatus.retryAfterMs,
      });
      activeDependencies.sendJson(context.res, HTTP_STATUS.TOO_MANY_REQUESTS, {
        error: ERROR_MESSAGES.TOO_MANY_LOGIN_ATTEMPTS,
      });
      return;
    }

    try {
      const result = await authService.login(context.req, context.res, password);
      loginRateLimiter.reset(limiterKey);
      activeDependencies.sendJson(context.res, 200, result);
    } catch (error: unknown) {
      // Auth errors need special handling for status codes
      const err = error as { statusCode?: number; message: string };
      const statusCode = err.statusCode || (err.message === 'Invalid password' ? 401 : 400);

      if (err.message === 'Invalid password') {
        const failure = loginRateLimiter.recordFailure(limiterKey);
        if (failure.limited) {
          log.warn('[agentrix] Login rate limit triggered', {
            clientIp,
            username: username || 'n/a',
            attempts: failure.attempts,
            retryAfterMs: failure.retryAfterMs,
          });
          activeDependencies.sendJson(context.res, HTTP_STATUS.TOO_MANY_REQUESTS, {
            error: ERROR_MESSAGES.TOO_MANY_LOGIN_ATTEMPTS,
          });
          return;
        }
      }

      activeDependencies.sendJson(context.res, statusCode, { error: err.message });
    }
  });

  const logout = createSimpleHandler(async (context: RequestContext) => authService.logout(context.req, context.res));

  const status = createSimpleHandler(
    async (context: RequestContext) => authService.getStatus(context.req)
  );

  return {
    login,
    logout,
    status,
  };
}
