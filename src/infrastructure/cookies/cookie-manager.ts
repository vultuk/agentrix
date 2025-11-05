import type { IncomingMessage } from 'node:http';
import { determineSecureCookie } from './cookie-security.js';

export interface CookieManagerOptions {
  secureSetting: string | boolean | undefined;
}

/**
 * Creates a cookie manager that handles secure flag resolution
 * @param options - Configuration options
 * @returns Cookie manager instance
 */
export function createCookieManager({ secureSetting }: CookieManagerOptions) {
  const normalized = typeof secureSetting === 'string' ? secureSetting.trim().toLowerCase() : secureSetting;
  
  return {
    /**
     * Resolves whether to use secure cookies for a request
     * @param req - HTTP request object
     * @returns Whether to set Secure flag
     */
    resolveSecure(req: IncomingMessage): boolean {
      return determineSecureCookie({ configValue: normalized, request: req });
    },
  };
}
