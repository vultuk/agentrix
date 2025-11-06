import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import type { IncomingMessage, ServerResponse } from 'node:http';

import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from '../config/constants.js';
import { createAuthManager, __setAuthTestOverrides } from './auth.js';

function createRequest(cookieHeader: string = ''): IncomingMessage {
  return { headers: cookieHeader ? { cookie: cookieHeader } : {} } as IncomingMessage;
}

function createResponse(): ServerResponse {
  return {} as ServerResponse;
}

describe('createAuthManager', () => {
  beforeEach(() => {
    __setAuthTestOverrides();
  });

  afterEach(() => {
    __setAuthTestOverrides();
  });

  it('issues session tokens, sets secure cookies, and authenticates requests', () => {
    const generateMock = mock.fn(() => 'token-12345');
    const setCookieMock = mock.fn(() => {});

    __setAuthTestOverrides({
      generateSessionToken: generateMock,
      setCookie: setCookieMock,
    });

    const manager = createAuthManager('super-secret');
    const req = createRequest();
    const res = createResponse();

    const token = manager.login(req, res, 'super-secret', { secure: true });

    assert.equal(token, 'token-12345');
    assert.equal(generateMock.mock.callCount(), 1);
    assert.equal(setCookieMock.mock.callCount(), 1);

    const call = setCookieMock.mock.calls[0];
    const [, cookieName, cookieValue, options] = call.arguments;
    assert.equal(cookieName, SESSION_COOKIE_NAME);
    assert.equal(cookieValue, 'token-12345');
    assert.deepEqual(options, {
      maxAge: SESSION_MAX_AGE_SECONDS,
      sameSite: 'Strict',
      httpOnly: true,
      path: '/',
      secure: true,
    });

    const authedReq = createRequest(`${SESSION_COOKIE_NAME}=token-12345`);
    assert.equal(manager.isAuthenticated(authedReq), true);
    assert.equal(manager.hasToken('token-12345'), true);
  });

  it('replaces existing tokens when logging in again', () => {
    const generateMock = mock.fn(() => 'token-A');
    const setCookieMock = mock.fn(() => {});

    __setAuthTestOverrides({
      generateSessionToken: generateMock,
      setCookie: setCookieMock,
    });

    const manager = createAuthManager('password');
    const res = createResponse();

    const firstToken = manager.login(createRequest(), res, 'password');
    assert.equal(firstToken, 'token-A');
    assert.equal(generateMock.mock.callCount(), 1);

    generateMock.mock.mockImplementationOnce(() => 'token-B');

    const secondReq = createRequest(`${SESSION_COOKIE_NAME}=token-A`);
    const secondToken = manager.login(secondReq, res, 'password');

    assert.equal(secondToken, 'token-B');
    assert.equal(manager.hasToken('token-A'), false);
    assert.equal(manager.hasToken('token-B'), true);
  });

  it('clears session cookies and tokens on logout', () => {
    const generateMock = mock.fn(() => 'token-logout');
    const setCookieMock = mock.fn(() => {});
    const clearCookieMock = mock.fn(() => {});

    __setAuthTestOverrides({
      generateSessionToken: generateMock,
      setCookie: setCookieMock,
      clearCookie: clearCookieMock,
    });

    const manager = createAuthManager('letmein');
    const res = createResponse();
    const req = createRequest();
    manager.login(req, res, 'letmein');
    assert.equal(setCookieMock.mock.callCount(), 1);

    const authedReq = createRequest(`${SESSION_COOKIE_NAME}=token-logout`);
    assert.equal(manager.isAuthenticated(authedReq), true);

    manager.logout(authedReq, res, { secure: false });

    assert.equal(manager.isAuthenticated(authedReq), false);
    assert.equal(manager.hasToken('token-logout'), false);
    assert.equal(clearCookieMock.mock.callCount(), 1);

    const [, cookieName, options] = clearCookieMock.mock.calls[0].arguments;
    assert.equal(cookieName, SESSION_COOKIE_NAME);
    assert.deepEqual(options, {
      path: '/',
      sameSite: 'Strict',
      httpOnly: true,
      secure: false,
    });
  });

  it('rejects missing or invalid passwords', () => {
    const manager = createAuthManager('secret');
    const res = createResponse();

    assert.throws(() => manager.login(createRequest(), res, ''), /Password is required/);
    assert.throws(() => manager.login(createRequest(), res, 'wrong'), /Invalid password/);
  });

  it('handles logout when no session is present', () => {
    const clearCookieMock = mock.fn(() => {});
    __setAuthTestOverrides({ clearCookie: clearCookieMock });
    const manager = createAuthManager('whatever');
    const req = createRequest();
    const res = createResponse();

    assert.doesNotThrow(() => manager.logout(req, res));
    assert.equal(clearCookieMock.mock.callCount(), 1);
  });
});


