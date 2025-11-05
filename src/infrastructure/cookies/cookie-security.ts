import type { IncomingMessage } from 'node:http';

export interface SecureCookieOptions {
  configValue: string | boolean | undefined;
  request: IncomingMessage | null;
}

/**
 * Cookie security utilities
 */

/**
 * Determines whether the Secure flag should be set on cookies
 * @param options - Configuration options
 * @returns Whether to set the Secure flag
 */
export function determineSecureCookie({ configValue, request }: SecureCookieOptions): boolean {
  const normalized = typeof configValue === 'string' ? configValue.trim().toLowerCase() : configValue;
  
  // Explicit configuration
  if (normalized === 'true' || normalized === true) {
    return true;
  }
  if (normalized === 'false' || normalized === false) {
    return false;
  }

  // Auto-detection based on request
  if (!request || typeof request !== 'object') {
    return false;
  }

  // Check if connection is encrypted (direct HTTPS)
  const socket = request.socket as { encrypted?: boolean } | undefined;
  const encrypted = Boolean(socket && socket.encrypted);
  if (encrypted) {
    return true;
  }

  // Check X-Forwarded-Proto header (behind reverse proxy)
  const forwardedProto = request.headers?.['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',').map((value) => value.trim().toLowerCase()).includes('https');
  }

  return false;
}
