import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { generateRandomPassword, generateSessionToken } from './random.js';

const PASSWORD_CHARSET = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.split(''));

describe('generateSessionToken', () => {
  it('produces base64url encoded tokens', () => {
    const token = generateSessionToken();

    assert.equal(typeof token, 'string');
    assert.ok(token.length > 0);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
  });
});

describe('generateRandomPassword', () => {
  it('uses the expected length and character set', () => {
    const password = generateRandomPassword();

    assert.equal(password.length, 12);
    for (const char of password) {
      assert.ok(PASSWORD_CHARSET.has(char), `Unexpected character ${char}`);
    }
  });

  it('respects custom length values', () => {
    const password = generateRandomPassword(24);

    assert.equal(password.length, 24);
  });
});

