import assert from 'node:assert/strict';
import type { IncomingMessage } from 'node:http';
import { describe, it } from 'node:test';

import { determineSecureCookie } from './cookie-security.js';

describe('determineSecureCookie', () => {
  it('honours explicit boolean or string configuration', () => {
    assert.equal(
      determineSecureCookie({ configValue: true, request: null as unknown as IncomingMessage }),
      true,
    );
    assert.equal(
      determineSecureCookie({ configValue: 'true', request: null as unknown as IncomingMessage }),
      true,
    );
    assert.equal(
      determineSecureCookie({ configValue: false, request: null as unknown as IncomingMessage }),
      false,
    );
    assert.equal(
      determineSecureCookie({ configValue: 'false', request: null as unknown as IncomingMessage }),
      false,
    );
  });

  it('defaults to false when request is missing', () => {
    assert.equal(determineSecureCookie({ configValue: undefined, request: null }), false);
  });

  it('detects encrypted sockets', () => {
    const request = {
      headers: {},
      socket: { encrypted: true },
    } as unknown as IncomingMessage;

    assert.equal(determineSecureCookie({ configValue: undefined, request }), true);
  });

  it('checks X-Forwarded-Proto header', () => {
    const request = {
      headers: { 'x-forwarded-proto': 'http, https' },
      socket: { encrypted: false },
    } as unknown as IncomingMessage;

    assert.equal(determineSecureCookie({ configValue: undefined, request }), true);

    const httpOnlyRequest = {
      headers: { 'x-forwarded-proto': 'http' },
      socket: { encrypted: false },
    } as unknown as IncomingMessage;

    assert.equal(determineSecureCookie({ configValue: undefined, request: httpOnlyRequest }), false);
  });
});

