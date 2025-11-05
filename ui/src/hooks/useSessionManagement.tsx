/**
 * Hook for managing terminal session tracking and idle acknowledgements
 */

import { useCallback, useRef, useState } from 'react';
import { 
  isFiniteNumber, 
  parseActivityTimestamp, 
  normaliseIdleAcknowledgementEntry, 
  createIdleAcknowledgementEntry, 
  getMetadataLastActivityMs, 
  isIdleAcknowledgementCurrent 
} from '../utils/activity.js';

export function useSessionManagement() {
  const knownSessionsRef = useRef(new Set<string>());
  const sessionMetadataRef = useRef(new Map<string, any>());
  const [sessionMetadataSnapshot, setSessionMetadataSnapshot] = useState(() => new Map<string, any>());
  const idleAcknowledgementsRef = useRef(new Map<string, any>());
  const [idleAcknowledgementsSnapshot, setIdleAcknowledgementsSnapshot] = useState(() => new Map<string, any>());

  const removeTrackedSession = useCallback(
    (key: string) => {
      if (!key) {
        return;
      }
      knownSessionsRef.current.delete(key);
      if (sessionMetadataRef.current.has(key)) {
        const nextMetadata = new Map(sessionMetadataRef.current);
        nextMetadata.delete(key);
        sessionMetadataRef.current = nextMetadata;
        setSessionMetadataSnapshot(new Map(nextMetadata));
      }
      if (idleAcknowledgementsRef.current.has(key)) {
        const nextAcknowledgements = new Map(idleAcknowledgementsRef.current);
        nextAcknowledgements.delete(key);
        idleAcknowledgementsRef.current = nextAcknowledgements;
        setIdleAcknowledgementsSnapshot(new Map(nextAcknowledgements));
      }
    },
    [setIdleAcknowledgementsSnapshot, setSessionMetadataSnapshot],
  );

  const syncKnownSessions = useCallback((sessions: any[]) => {
    const aggregated = new Map<string, any>();
    if (Array.isArray(sessions)) {
      sessions.forEach((item: any) => {
        if (!item || typeof item !== 'object') {
          return;
        }
        const org = typeof item.org === 'string' ? item.org : null;
        const repo = typeof item.repo === 'string' ? item.repo : null;
        const branch = typeof item.branch === 'string' ? item.branch : null;
        if (!org || !repo || !branch) {
          return;
        }
        const key = `${org}::${repo}::${branch}`;
        const idle = Boolean(item.idle);
        const lastActivityAtMs = parseActivityTimestamp(item.lastActivityAt);
        const existing = aggregated.get(key);
        if (!existing) {
          aggregated.set(key, {
            org,
            repo,
            branch,
            idle,
            lastActivityAtMs,
          });
          return;
        }
        existing.idle = existing.idle && idle;
        if (
          isFiniteNumber(lastActivityAtMs) &&
          (!isFiniteNumber(existing.lastActivityAtMs) || lastActivityAtMs > existing.lastActivityAtMs)
        ) {
          existing.lastActivityAtMs = lastActivityAtMs;
        }
      });
    }

    const nextKnownSessions = new Set<string>();
    const nextMetadata = new Map<string, any>();
    aggregated.forEach((value, key) => {
      const lastActivityAtMs = isFiniteNumber(value.lastActivityAtMs) ? value.lastActivityAtMs : null;
      nextKnownSessions.add(key);
      nextMetadata.set(key, {
        org: value.org,
        repo: value.repo,
        branch: value.branch,
        idle: value.idle,
        lastActivityAtMs,
        lastActivityAt: isFiniteNumber(lastActivityAtMs) ? new Date(lastActivityAtMs).toISOString() : null,
      });
    });

    knownSessionsRef.current = nextKnownSessions;
    sessionMetadataRef.current = nextMetadata;
    setSessionMetadataSnapshot(new Map(nextMetadata));

    const nextAcknowledgements = new Map<string, any>();
    idleAcknowledgementsRef.current.forEach((value, key) => {
      const metadata = nextMetadata.get(key);
      if (!metadata) {
        return;
      }
      const entry = normaliseIdleAcknowledgementEntry(value);
      if (!isIdleAcknowledgementCurrent(metadata, entry)) {
        return;
      }
      const metadataLastActivityMs = getMetadataLastActivityMs(metadata);
      if (isFiniteNumber(metadataLastActivityMs)) {
        entry.lastSeenActivityMs = metadataLastActivityMs;
      }
      nextAcknowledgements.set(key, entry);
    });

    idleAcknowledgementsRef.current = nextAcknowledgements;
    setIdleAcknowledgementsSnapshot(new Map(nextAcknowledgements));
  }, []);

  const acknowledgeIdleSession = useCallback((org: string, repo: string, branch: string) => {
    const key = `${org}::${repo}::${branch}`;
    const metadata = sessionMetadataRef.current.get(key);
    if (metadata && metadata.idle) {
      const nextAcknowledgements = new Map(idleAcknowledgementsRef.current);
      nextAcknowledgements.set(
        key,
        createIdleAcknowledgementEntry(getMetadataLastActivityMs(metadata)),
      );
      idleAcknowledgementsRef.current = nextAcknowledgements;
      setIdleAcknowledgementsSnapshot(new Map(nextAcknowledgements));
    }
  }, []);

  return {
    knownSessionsRef,
    sessionMetadataRef,
    sessionMetadataSnapshot,
    setSessionMetadataSnapshot,
    idleAcknowledgementsRef,
    idleAcknowledgementsSnapshot,
    setIdleAcknowledgementsSnapshot,
    removeTrackedSession,
    syncKnownSessions,
    acknowledgeIdleSession,
  };
}

