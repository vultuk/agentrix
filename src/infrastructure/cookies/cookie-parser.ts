import type { ServerResponse } from 'node:http';

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
 * Cookie parsing and serialization utilities
 */

/**
 * Parses a Cookie header string into an object
 * @param header - The Cookie header value
 * @returns Object mapping cookie names to values
 */
export function parseCookies(header: string | undefined): Record<string, string> {
  if (typeof header !== 'string' || !header.trim()) {
    return {};
  }

  return header.split(';').reduce((acc, part) => {
    const [name, ...rest] = part.split('=');
    if (!name) {
      return acc;
    }
    const key = name.trim();
    if (!key) {
      return acc;
    }
    const value = rest.join('=').trim();
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);
}

/**
 * Serializes a cookie with options into a Set-Cookie header value
 * @param name - Cookie name
 * @param value - Cookie value
 * @param options - Cookie options
 * @returns Set-Cookie header value
 */
export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${value}`];

  if (options.maxAge != null) {
    parts.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires instanceof Date) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }

  const path = options.path || '/';
  if (path) {
    parts.push(`Path=${path}`);
  }

  const sameSite = options.sameSite || 'Strict';
  if (sameSite) {
    parts.push(`SameSite=${sameSite}`);
  }

  if (options.httpOnly !== false) {
    parts.push('HttpOnly');
  }

  if (options.secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

/**
 * Sets a cookie on the response
 * @param res - HTTP response object
 * @param name - Cookie name
 * @param value - Cookie value
 * @param options - Cookie options
 */
export function setCookie(res: ServerResponse, name: string, value: string, options: CookieOptions = {}): void {
  const header = serializeCookie(name, value, options);
  const existing = res.getHeader('Set-Cookie');
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, header]);
  } else if (existing) {
    res.setHeader('Set-Cookie', [String(existing), header]);
  } else {
    res.setHeader('Set-Cookie', header);
  }
}

/**
 * Clears a cookie by setting it to expire
 * @param res - HTTP response object
 * @param name - Cookie name
 * @param options - Cookie options
 */
export function clearCookie(res: ServerResponse, name: string, options: CookieOptions = {}): void {
  const expires = new Date(0);
  setCookie(res, name, '', { ...options, maxAge: 0, expires });
}
