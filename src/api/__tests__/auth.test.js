import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createAuthHandlers } from '../auth.js';
import { createAuthManager } from '../../core/auth.js';
import { createCookieManager } from '../../server/cookies.js';

function createResponse() {
  const headers = {};
  return {
    statusCode: 0,
    headers,
    body: '',
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    end(payload = '') {
      this.body = payload;
    },
  };
}

test('login sets Secure cookie when request is HTTPS', async () => {
  const authManager = createAuthManager('secret');
  const cookieManager = createCookieManager({ secureSetting: 'auto' });
  const handlers = createAuthHandlers(authManager, { cookieManager });

  const context = {
    req: {
      headers: { 'x-forwarded-proto': 'https' },
      socket: {},
    },
    res: createResponse(),
    readJsonBody: async () => ({ password: 'secret' }),
  };

  await handlers.login(context);
  const header = context.res.getHeader('set-cookie');
  assert.ok(header.includes('Secure'));
});

test('login omits Secure cookie when explicitly disabled', async () => {
  const authManager = createAuthManager('secret');
  const cookieManager = createCookieManager({ secureSetting: 'false' });
  const handlers = createAuthHandlers(authManager, { cookieManager });

  const context = {
    req: {
      headers: {},
      socket: {},
    },
    res: createResponse(),
    readJsonBody: async () => ({ password: 'secret' }),
  };

  await handlers.login(context);
  const header = context.res.getHeader('set-cookie');
  assert.ok(!header.includes('Secure'));
});
