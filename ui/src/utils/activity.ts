/**
 * Utilities for tracking and managing terminal activity acknowledgements
 */

import { ACKNOWLEDGEMENT_ACTIVITY_TOLERANCE_MS } from '../config/constants.js';

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
    const entry = value as Partial<IdleAcknowledgementEntry>;
    const acknowledgedAt = isFiniteNumber(entry.acknowledgedAt) ? entry.acknowledgedAt : Date.now();
    const lastSeenActivityMs = isFiniteNumber(entry.lastSeenActivityMs)
      ? entry.lastSeenActivityMs
      : null;
    if (
      acknowledgedAt === entry.acknowledgedAt &&
      lastSeenActivityMs === entry.lastSeenActivityMs
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

export interface TerminalMetadata {
  lastActivityAtMs?: number;
  lastActivityAt?: string | Date;
}

export function getMetadataLastActivityMs(metadata: TerminalMetadata | null | undefined): number | null {
  if (!metadata) {
    return null;
  }
  if (isFiniteNumber(metadata.lastActivityAtMs)) {
    return metadata.lastActivityAtMs;
  }
  return parseActivityTimestamp(metadata.lastActivityAt);
}

export function isIdleAcknowledgementCurrent(
  metadata: TerminalMetadata | null | undefined,
  acknowledgement: unknown
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
  return metadataLastActivityMs <= entry.acknowledgedAt + ACKNOWLEDGEMENT_ACTIVITY_TOLERANCE_MS;
}

