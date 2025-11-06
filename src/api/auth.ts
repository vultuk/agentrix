import { sendJson } from '../utils/http.js';
import { createAuthService } from '../services/index.js';
import { asyncHandler } from '../infrastructure/errors/index.js';
import { createSimpleHandler } from './base-handler.js';
import type { RequestContext } from '../types/http.js';
import type { AuthManager, CookieManager } from '../types/auth.js';

interface AuthDependencies {
  createAuthService: typeof createAuthService;
  sendJson: typeof sendJson;
}

const defaultDependencies: AuthDependencies = {
  createAuthService,
  sendJson,
};

let activeDependencies: AuthDependencies = { ...defaultDependencies };

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

export function createAuthHandlers(
  authManager: AuthManager,
  { cookieManager }: { cookieManager?: CookieManager } = {}
) {
  const authService = activeDependencies.createAuthService(authManager, cookieManager);

  // Login requires special error handling for status codes
  const login = asyncHandler(async (context: RequestContext) => {
    const payload = await context.readJsonBody();
    const password = typeof payload['password'] === 'string' ? payload['password'].trim() : '';

    try {
      const result = await authService.login(context.req, context.res, password);
      activeDependencies.sendJson(context.res, 200, result);
    } catch (error: unknown) {
      // Auth errors need special handling for status codes
      const err = error as { statusCode?: number; message: string };
      const statusCode = err.statusCode || (err.message === 'Invalid password' ? 401 : 400);
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
