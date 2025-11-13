import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRateLimiter } from './rate-limiter.js';

describe('createRateLimiter', () => {
  it('blocks when attempts exceed threshold', () => {
    let currentTime = 0;
    const limiter = createRateLimiter({
      windowMs: 1000,
      maxAttempts: 3,
      now: () => currentTime,
    });

    const initial = limiter.check('user');
    assert.equal(initial.limited, false);
    assert.equal(initial.attempts, 0);

    limiter.recordFailure('user');
    limiter.recordFailure('user');
    const result = limiter.recordFailure('user');

    assert.equal(result.limited, true);
    assert.equal(result.attempts, 3);
    assert.equal(result.retryAfterMs > 0, true);

    const blocked = limiter.check('user');
    assert.equal(blocked.limited, true);
    assert.equal(blocked.attempts, 3);
  });

  it('resets attempts after the window elapses', () => {
    let currentTime = 0;
    const limiter = createRateLimiter({
      windowMs: 500,
      maxAttempts: 2,
      now: () => currentTime,
    });

    limiter.recordFailure('client');
    limiter.recordFailure('client');
    assert.equal(limiter.check('client').limited, true);

    currentTime = 1000;

    const afterWindow = limiter.check('client');
    assert.equal(afterWindow.limited, false);
    assert.equal(afterWindow.attempts, 0);
  });

  it('clears attempts on reset', () => {
    let currentTime = 0;
    const limiter = createRateLimiter({
      windowMs: 1000,
      maxAttempts: 1,
      now: () => currentTime,
    });

    limiter.recordFailure('reset');
    assert.equal(limiter.check('reset').limited, true);

    limiter.reset('reset');
    const result = limiter.check('reset');
    assert.equal(result.limited, false);
    assert.equal(result.attempts, 0);
  });

  it('validates options', () => {
    assert.throws(() => createRateLimiter({ windowMs: 0, maxAttempts: 1 }), /windowMs/);
    assert.throws(() => createRateLimiter({ windowMs: 1000, maxAttempts: 0 }), /maxAttempts/);
  });
});

