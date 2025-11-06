import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import { createConsoleLogger, createLogger } from './logger.js';

describe('logger', () => {
  it('delegates to provided implementation when methods exist', () => {
    const provided = {
      info: mock.fn(),
      error: mock.fn(),
      warn: mock.fn(),
      debug: mock.fn(),
    };
    const logger = createLogger(provided);

    logger.info('info');
    logger.error('error', { detail: true });
    logger.warn('warn');
    logger.debug('debug');

    assert.equal(provided.info.mock.calls.length, 1);
    assert.equal(provided.error.mock.calls.length, 1);
    assert.equal(provided.warn.mock.calls.length, 1);
    assert.equal(provided.debug.mock.calls.length, 1);
  });

  it('falls back to console when methods are missing', () => {
    const infoMock = mock.method(console, 'info', () => {});
    const errorMock = mock.method(console, 'error', () => {});
    const warnMock = mock.method(console, 'warn', () => {});
    const debugMock = mock.method(console, 'debug', () => {});

    try {
      const logger = createLogger({});
      logger.info('info');
      logger.error('error');
      logger.warn('warn');
      logger.debug('debug');

      assert.equal(infoMock.mock.calls.length, 1);
      assert.equal(errorMock.mock.calls.length, 1);
      assert.equal(warnMock.mock.calls.length, 1);
      assert.equal(debugMock.mock.calls.length, 1);
    } finally {
      infoMock.mock.restore();
      errorMock.mock.restore();
      warnMock.mock.restore();
      debugMock.mock.restore();
    }
  });

  it('createConsoleLogger produces console-backed logger', () => {
    const infoMock = mock.method(console, 'info', () => {});
    try {
      const logger = createConsoleLogger();
      logger.info('message');
      assert.equal(infoMock.mock.calls.length, 1);
    } finally {
      infoMock.mock.restore();
    }
  });
});

