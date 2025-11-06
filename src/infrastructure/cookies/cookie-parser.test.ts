import assert from 'node:assert/strict';
import type { ServerResponse } from 'node:http';
import { describe, it } from 'node:test';

import { clearCookie, parseCookies, serializeCookie, setCookie } from './cookie-parser.js';

class MockResponse {
  public headers = new Map<string, string | string[]>();

  setHeader(name: string, value: string | string[]): void {
    this.headers.set(name.toLowerCase(), value);
  }

  getHeader(name: string): string | string[] | undefined {
    return this.headers.get(name.toLowerCase());
  }

  end(): void {
    // no-op for tests
  }
}

describe('parseCookies', () => {
  it('returns empty object for missing or invalid headers', () => {
    assert.deepEqual(parseCookies(undefined), {});
    assert.deepEqual(parseCookies(''), {});
  });

  it('parses cookie header entries', () => {
    const cookies = parseCookies('session=abc123; theme=dark; empty=');

    assert.deepEqual(cookies, {
      session: 'abc123',
      theme: 'dark',
      empty: '',
    });
  });
});

describe('serializeCookie', () => {
  it('applies secure defaults', () => {
    const value = serializeCookie('session', 'value');

    assert.match(value, /session=value/);
    assert.match(value, /Path=\//);
    assert.match(value, /SameSite=Strict/);
    assert.match(value, /HttpOnly/);
  });

  it('supports optional attributes', () => {
    const expires = new Date('2024-01-01T00:00:00Z');
    const value = serializeCookie('pref', 'x', {
      maxAge: 60,
      expires,
      path: '/custom',
      sameSite: 'None',
      httpOnly: false,
      secure: true,
    });

    assert.match(value, /Max-Age=60/);
    assert.match(value, /Expires=/);
    assert.match(value, /Path=\/custom/);
    assert.match(value, /SameSite=None/);
    assert.doesNotMatch(value, /HttpOnly/);
    assert.match(value, /Secure/);
  });
});

describe('setCookie', () => {
  it('appends Set-Cookie headers', () => {
    const res = new MockResponse();
    const response = res as unknown as ServerResponse;

    setCookie(response, 'a', '1');
    setCookie(response, 'b', '2');

    const header = res.getHeader('set-cookie');
    assert.ok(Array.isArray(header));
    assert.equal(header?.length, 2);
  });
});

describe('clearCookie', () => {
  it('sets an expired cookie', () => {
    const res = new MockResponse();
    const response = res as unknown as ServerResponse;

    clearCookie(response, 'session');

    const header = res.getHeader('set-cookie');
    assert.ok(typeof header === 'string');
    assert.match(String(header), /Max-Age=0/);
  });
});

