export const isFiniteNumber = (value: unknown): value is number => 
  typeof value === 'number' && Number.isFinite(value);

export const parseActivityTimestamp = (value: unknown): number | null => {
  if (isFiniteNumber(value)) {
    return value;
  }
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

export interface IdleAcknowledgementEntry {
  acknowledgedAt: number;
  lastSeenActivityMs: number | null;
}

export function normaliseIdleAcknowledgementEntry(value: unknown): IdleAcknowledgementEntry {
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const acknowledgedAt = isFiniteNumber(obj.acknowledgedAt) ? obj.acknowledgedAt : Date.now();
    const lastSeenActivityMs = isFiniteNumber(obj.lastSeenActivityMs)
      ? obj.lastSeenActivityMs
      : null;
    if (
      acknowledgedAt === obj.acknowledgedAt &&
      lastSeenActivityMs === obj.lastSeenActivityMs
    ) {
      return value as IdleAcknowledgementEntry;
    }
    return { acknowledgedAt, lastSeenActivityMs };
  }
  if (isFiniteNumber(value)) {
    return { acknowledgedAt: value, lastSeenActivityMs: null };
  }
  return { acknowledgedAt: Date.now(), lastSeenActivityMs: null };
}

export function createIdleAcknowledgementEntry(lastActivityAtMs: unknown): IdleAcknowledgementEntry {
  return {
    acknowledgedAt: Date.now(),
    lastSeenActivityMs: isFiniteNumber(lastActivityAtMs) ? lastActivityAtMs : null,
  };
}

export function getMetadataLastActivityMs(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }
  const obj = metadata as Record<string, unknown>;
  if (isFiniteNumber(obj.lastActivityAtMs)) {
    return obj.lastActivityAtMs;
  }
  return parseActivityTimestamp(obj.lastActivityAt);
}

export function isIdleAcknowledgementCurrent(
  metadata: unknown,
  acknowledgement: unknown,
  toleranceMs = 1500
): boolean {
  if (!acknowledgement) {
    return false;
  }
  const entry = normaliseIdleAcknowledgementEntry(acknowledgement);
  if (!isFiniteNumber(entry.acknowledgedAt)) {
    return false;
  }
  const metadataLastActivityMs = getMetadataLastActivityMs(metadata);
  if (!isFiniteNumber(metadataLastActivityMs)) {
    return true;
  }
  return metadataLastActivityMs <= entry.acknowledgedAt + toleranceMs;
}

