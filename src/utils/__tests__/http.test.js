import { test } from 'node:test';
import assert from 'node:assert/strict';

import { determineSecureCookie } from '../http.js';

test('determineSecureCookie respects explicit true/false', () => {
  const req = { headers: {}, socket: {} };
  assert.equal(determineSecureCookie({ configValue: 'true', request: req }), true);
  assert.equal(determineSecureCookie({ configValue: true, request: req }), true);
  assert.equal(determineSecureCookie({ configValue: 'false', request: req }), false);
  assert.equal(determineSecureCookie({ configValue: false, request: req }), false);
});

test('determineSecureCookie detects encrypted socket', () => {
  const req = { headers: {}, socket: { encrypted: true } };
  assert.equal(determineSecureCookie({ configValue: 'auto', request: req }), true);
});

test('determineSecureCookie inspects X-Forwarded-Proto header', () => {
  const req = {
    headers: { 'x-forwarded-proto': 'http, https' },
    socket: {},
  };
  assert.equal(determineSecureCookie({ configValue: 'auto', request: req }), true);
});

test('determineSecureCookie falls back to false when auto cannot detect', () => {
  const req = { headers: {}, socket: {} };
  assert.equal(determineSecureCookie({ configValue: 'auto', request: req }), false);
});
