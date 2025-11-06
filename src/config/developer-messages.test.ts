import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, mock } from 'node:test';

import { loadDeveloperMessage } from './developer-messages.js';

describe('developer messages', () => {
  it('returns fallback when slug missing or homedir unavailable', async () => {
    const homedirMock = mock.method(os, 'homedir', () => '');
    try {
      const message = await loadDeveloperMessage('', 'fallback');
      assert.equal(message, 'fallback');
    } finally {
      homedirMock.mock.restore();
    }
  });

  it('reads message from file and caches subsequent lookups', async () => {
    const homedirMock = mock.method(os, 'homedir', () => '/home/tester');
    const readMock = mock.method(fs, 'readFile', async (filePath: string) => {
      assert.equal(filePath, path.join('/home/tester', '.agentrix', 'welcome.md'));
      return '  hello world  ';
    });

    try {
      const first = await loadDeveloperMessage('welcome', 'fallback');
      const second = await loadDeveloperMessage('welcome', 'fallback');
      assert.equal(first, 'hello world');
      assert.equal(second, 'hello world');
      assert.equal(readMock.mock.calls.length, 1);
    } finally {
      homedirMock.mock.restore();
      readMock.mock.restore();
    }
  });

  it('logs warning and falls back when read fails unexpectedly', async () => {
    const homedirMock = mock.method(os, 'homedir', () => '/home/tester');
    const readMock = mock.method(fs, 'readFile', async () => {
      const error = new Error('boom');
      (error as NodeJS.ErrnoException).code = 'EACCES';
      throw error;
    });
    const warnMock = mock.method(console, 'warn', () => {});

    try {
      const value = await loadDeveloperMessage('oops', 'fallback');
      assert.equal(value, 'fallback');
      assert.equal(warnMock.mock.calls.length, 1);
    } finally {
      homedirMock.mock.restore();
      readMock.mock.restore();
      warnMock.mock.restore();
    }
  });
});

