export interface RateLimiterOptions {
  windowMs: number;
  maxAttempts: number;
  now?: () => number;
}

export interface RateLimiterResult {
  limited: boolean;
  retryAfterMs: number;
  attempts: number;
}

export interface RateLimiter {
  check(key: string): RateLimiterResult;
  recordFailure(key: string): RateLimiterResult;
  reset(key: string): void;
}

interface RateLimiterEntry {
  attempts: number[];
  timeout?: ReturnType<typeof setTimeout>;
}

function pruneAttempts(entry: RateLimiterEntry, windowMs: number, now: number): void {
  const threshold = now - windowMs;
  if (entry.attempts.length === 0) {
    return;
  }
  let firstValidIndex = 0;
  while (firstValidIndex < entry.attempts.length && entry.attempts[firstValidIndex]! <= threshold) {
    firstValidIndex += 1;
  }
  if (firstValidIndex > 0) {
    entry.attempts.splice(0, firstValidIndex);
  }
}

function computeRetryAfter(entry: RateLimiterEntry, windowMs: number, now: number): number {
  if (entry.attempts.length === 0) {
    return 0;
  }
  const oldestAttempt = entry.attempts[0]!;
  const expiresAt = oldestAttempt + windowMs;
  const remaining = expiresAt - now;
  return remaining > 0 ? remaining : 0;
}

function scheduleEntryCleanup(
  entries: Map<string, RateLimiterEntry>,
  key: string,
  entry: RateLimiterEntry,
  windowMs: number,
): void {
  if (entry.timeout) {
    clearTimeout(entry.timeout);
  }
  entry.timeout = setTimeout(() => {
    entries.delete(key);
  }, windowMs);
  if (typeof entry.timeout.unref === 'function') {
    entry.timeout.unref();
  }
}

export function createRateLimiter({ windowMs, maxAttempts, now = () => Date.now() }: RateLimiterOptions): RateLimiter {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error('windowMs must be a positive number');
  }
  if (!Number.isFinite(maxAttempts) || maxAttempts <= 0) {
    throw new Error('maxAttempts must be a positive number');
  }

  const entries = new Map<string, RateLimiterEntry>();

  const emptyResult: RateLimiterResult = { limited: false, retryAfterMs: 0, attempts: 0 };

  const ensureEntry = (key: string): RateLimiterEntry => {
    let entry = entries.get(key);
    if (!entry) {
      entry = { attempts: [] };
      entries.set(key, entry);
    }
    return entry;
  };

  const cleanEntry = (key: string, entry: RateLimiterEntry): void => {
    if (entry.timeout) {
      clearTimeout(entry.timeout);
    }
    entries.delete(key);
  };

  const buildResult = (entry: RateLimiterEntry, limited: boolean, currentTime: number): RateLimiterResult => ({
    limited,
    retryAfterMs: limited ? computeRetryAfter(entry, windowMs, currentTime) : 0,
    attempts: entry.attempts.length,
  });

  return {
    check(key: string): RateLimiterResult {
      const entry = entries.get(key);
      if (!entry) {
        return emptyResult;
      }
      const currentTime = now();
      pruneAttempts(entry, windowMs, currentTime);
      if (entry.attempts.length === 0) {
        cleanEntry(key, entry);
        return emptyResult;
      }
      const limited = entry.attempts.length >= maxAttempts;
      if (!limited) {
        scheduleEntryCleanup(entries, key, entry, windowMs);
      }
      return buildResult(entry, limited, currentTime);
    },
    recordFailure(key: string): RateLimiterResult {
      const entry = ensureEntry(key);
      const currentTime = now();
      pruneAttempts(entry, windowMs, currentTime);
      entry.attempts.push(currentTime);
      scheduleEntryCleanup(entries, key, entry, windowMs);
      const limited = entry.attempts.length >= maxAttempts;
      return buildResult(entry, limited, currentTime);
    },
    reset(key: string): void {
      const entry = entries.get(key);
      if (!entry) {
        return;
      }
      cleanEntry(key, entry);
    },
  };
}

