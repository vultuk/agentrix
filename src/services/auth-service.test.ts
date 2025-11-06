import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { AuthService, createAuthService } from './auth-service.js';

function createMocks() {
  const authManager = {
    login: mock.fn(),
    logout: mock.fn(),
    isAuthenticated: mock.fn(() => false),
  };
  const cookieManager = {
    resolveSecure: mock.fn(() => true),
  };
  const req = {} as never;
  const res = {} as never;
  return { authManager, cookieManager, req, res };
}

describe('AuthService', () => {
  it('logs in using secure cookie resolution when provided', async () => {
    const { authManager, cookieManager, req, res } = createMocks();
    const service = new AuthService(authManager as never, cookieManager as never);

    const result = await service.login(req, res, 'password');

    assert.deepEqual(result, { authenticated: true });
    assert.equal(cookieManager.resolveSecure.mock.calls.length, 1);
    assert.equal(authManager.login.mock.calls.length, 1);
    assert.deepEqual(authManager.login.mock.calls[0]?.arguments, [req, res, 'password', { secure: true }]);
  });

  it('logs out and respects cookie secure resolution', async () => {
    const { authManager, cookieManager, req, res } = createMocks();
    const service = new AuthService(authManager as never, cookieManager as never);

    const result = await service.logout(req, res);

    assert.deepEqual(result, { authenticated: false });
    assert.equal(cookieManager.resolveSecure.mock.calls.length, 1);
    assert.equal(authManager.logout.mock.calls.length, 1);
    assert.deepEqual(authManager.logout.mock.calls[0]?.arguments, [req, res, { secure: true }]);
  });

  it('exposes status check and factory helper', async () => {
    const { authManager, req } = createMocks();
    authManager.isAuthenticated.mock.mockImplementation(() => true);
    const service = createAuthService(authManager as never);

    const result = await service.getStatus(req);

    assert.deepEqual(result, { authenticated: true });
    assert.equal(authManager.isAuthenticated.mock.calls.length, 1);
    assert.equal(authManager.isAuthenticated.mock.calls[0]?.arguments[0], req);
  });
});

