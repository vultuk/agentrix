import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
  ValidationError,
  warnConfig,
  validatePort,
  validateString,
  validateBranchLlm,
  validateTerminalSessionMode,
  validateCookieSecure,
  pickFirst,
} from './validation.js';

describe('CLI validation helpers', () => {
  it('warnConfig writes to stderr', () => {
    const chunks: string[] = [];
    const stderrMock = mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });

    try {
      warnConfig('Test message');
    } finally {
      stderrMock.mock.restore();
    }

    assert.ok(chunks.some((chunk) => chunk.includes('Test message')));
  });

  it('validates port values and warns on invalid input', () => {
    const messages: string[] = [];
    const stderrMock = mock.method(process.stderr, 'write', (chunk: string | Uint8Array) => {
      messages.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    });

    try {
      assert.equal(validatePort('8080', 'port', 'config.json'), 8080);
      assert.equal(validatePort(65535, 'port', 'config.json'), 65535);
      assert.equal(validatePort(undefined, 'port', 'config.json'), undefined);
      assert.equal(validatePort(null, 'port', 'config.json'), undefined);
      assert.equal(validatePort('invalid', 'port', 'config.json'), undefined);
    } finally {
      stderrMock.mock.restore();
    }

    assert.ok(messages.some((message) => message.includes('Ignoring invalid port')));
  });

  it('validates strings and trims whitespace', () => {
    const result = validateString('  value  ', 'field', 'config');
    assert.equal(result, 'value');
    assert.equal(validateString(undefined, 'field', 'config'), undefined);
    assert.equal(validateString('', 'field', 'config'), undefined);
  });

  it('validates supported branch LLMs and terminal session modes', () => {
    assert.equal(validateBranchLlm('Cursor', 'branch', 'config'), 'cursor');
    assert.equal(validateBranchLlm('unknown', 'branch', 'config'), undefined);

    assert.equal(validateTerminalSessionMode('tmux', 'tsm', 'config'), 'tmux');
    assert.equal(validateTerminalSessionMode('invalid', 'tsm', 'config'), undefined);
  });

  it('validates cookie secure values', () => {
    assert.equal(validateCookieSecure('true', 'cookieSecure', 'config'), 'true');
    assert.equal(validateCookieSecure(true, 'cookieSecure', 'config'), 'true');
    assert.equal(validateCookieSecure('invalid', 'cookieSecure', 'config'), undefined);
  });

  it('pickFirst returns the first validated value', () => {
    const value = pickFirst(
      [
        { value: undefined, name: 'first' },
        { value: ' second ', name: 'second' },
      ],
      validateString,
      'config',
    );
    assert.equal(value, 'second');
  });

  it('creates ValidationError instances', () => {
    const error = new ValidationError('message');
    assert.equal(error.message, 'message');
    assert.equal(error.name, 'ValidationError');
  });
});

