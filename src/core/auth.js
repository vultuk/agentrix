import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '../config/constants.js';
import { clearCookie, parseCookies, setCookie } from '../utils/cookies.js';
import { generateSessionToken } from '../utils/random.js';

export function createAuthManager(expectedPassword) {
  const validSessionTokens = new Set();

  function createError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  }

  function getTokenFromRequest(req) {
    const cookies = parseCookies(req.headers?.cookie);
    return cookies[SESSION_COOKIE_NAME] || '';
  }

  function isAuthenticated(req) {
    const token = getTokenFromRequest(req);
    return Boolean(token && validSessionTokens.has(token));
  }

  function login(req, res, providedPassword, options = {}) {
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

  function logout(req, res, options = {}) {
    const token = getTokenFromRequest(req);
    if (token) {
      validSessionTokens.delete(token);
    }
    clearCookie(res, SESSION_COOKIE_NAME, { path: '/', sameSite: 'Strict', httpOnly: true, secure: options?.secure });
  }

  function hasToken(token) {
    return validSessionTokens.has(token);
  }

  function clear() {
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
