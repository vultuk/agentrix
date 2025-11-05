/**
 * @deprecated Use infrastructure/cookies instead
 * This file re-exports for backward compatibility
 */
export {
  parseCookies,
  serializeCookie,
  setCookie,
  clearCookie,
} from '../infrastructure/cookies/index.js';
export type { CookieOptions } from '../infrastructure/cookies/index.js';
