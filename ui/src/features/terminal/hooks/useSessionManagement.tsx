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
} from '../../../utils/activity.js';

interface PendingNotification {
  key: string;
  title: string;
  options?: NotificationOptions;
}

export function useSessionManagement() {
  const knownSessionsRef = useRef(new Set<string>());
  const sessionMetadataRef = useRef(new Map<string, any>());
  const [sessionMetadataSnapshot, setSessionMetadataSnapshot] = useState(() => new Map<string, any>());
  const idleAcknowledgementsRef = useRef(new Map<string, any>());
  const [idleAcknowledgementsSnapshot, setIdleAcknowledgementsSnapshot] = useState(() => new Map<string, any>());
  const idleNotificationMarkersRef = useRef(new Map<string, number | null>());
  const pendingNotificationsRef = useRef<PendingNotification[]>([]);
  const notificationRequestRef = useRef<Promise<NotificationPermission> | null>(null);

  const normaliseSessionTabs = useCallback((payload: unknown) => {
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload
      .map((entry: any) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const id = typeof entry.id === 'string' ? entry.id : null;
        if (!id) {
          return null;
        }
        const label =
          typeof entry.label === 'string' && entry.label.trim().length > 0
            ? entry.label.trim()
            : 'Terminal';
        const kind = entry.kind === 'automation' ? 'automation' : 'interactive';
        const tool = entry.tool === 'agent' ? 'agent' : 'terminal';
        const lastActivityAt =
          typeof entry.lastActivityAt === 'string' ? entry.lastActivityAt : null;
        const createdAt =
          typeof entry.createdAt === 'string' ? entry.createdAt : null;
        const tmuxSessionName =
          typeof entry.tmuxSessionName === 'string' && entry.tmuxSessionName.trim().length > 0
            ? entry.tmuxSessionName.trim()
            : null;
        return {
          id,
          label,
          kind,
          tool,
          idle: Boolean(entry.idle),
          usingTmux: Boolean(entry.usingTmux),
          lastActivityAt,
          createdAt,
          tmuxSessionName,
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
  }, []);

  const flushNotificationQueue = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.Notification !== 'function') {
      pendingNotificationsRef.current = [];
      return;
    }
    if (window.Notification.permission !== 'granted') {
      return;
    }
    const queue = pendingNotificationsRef.current;
    pendingNotificationsRef.current = [];
    queue.forEach(({ title, options }) => {
      try {
        // Using tag in options ensures subsequent notifications replace the previous one.
        new window.Notification(title, options);
      } catch {
        // Ignore notification errors (e.g. browser restrictions).
      }
    });
  }, []);

  const enqueueNotification = useCallback((notification: PendingNotification) => {
    const queue = pendingNotificationsRef.current;
    const existingIndex = queue.findIndex((item) => item.key === notification.key);
    if (existingIndex >= 0) {
      pendingNotificationsRef.current = [
        ...queue.slice(0, existingIndex),
        notification,
        ...queue.slice(existingIndex + 1),
      ];
    } else {
      pendingNotificationsRef.current = [...queue, notification];
    }
  }, []);

  const requestNotificationPermissionIfNeeded = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.Notification !== 'function') {
      pendingNotificationsRef.current = [];
      return Promise.resolve<'denied'>('denied');
    }
    const permission = window.Notification.permission;
    if (permission === 'granted' || permission === 'denied') {
      if (permission === 'granted') {
        flushNotificationQueue();
      } else {
        pendingNotificationsRef.current = [];
      }
      return Promise.resolve(permission);
    }
    if (notificationRequestRef.current) {
      return notificationRequestRef.current;
    }
    try {
      const requestResult = window.Notification.requestPermission();
      const permissionPromise =
        requestResult instanceof Promise ? requestResult : Promise.resolve(requestResult);
      notificationRequestRef.current = permissionPromise
        .then((result) => {
          notificationRequestRef.current = null;
          if (result === 'granted') {
            flushNotificationQueue();
          } else {
            pendingNotificationsRef.current = [];
          }
          return result;
        })
        .catch(() => {
          notificationRequestRef.current = null;
          pendingNotificationsRef.current = [];
          return 'denied';
        });
      return notificationRequestRef.current;
    } catch {
      pendingNotificationsRef.current = [];
      return Promise.resolve<'denied'>('denied');
    }
  }, [flushNotificationQueue]);

  const deliverIdleNotification = useCallback(
    (key: string, org: string, repo: string, branch: string) => {
      if (typeof window === 'undefined' || typeof window.Notification !== 'function') {
        return;
      }
      const title = 'Worktree idle';
      const notificationOptions: NotificationOptions = {
        body: `${org}/${repo}: ${branch} work has finished.`,
        tag: key,
      };

      const permission = window.Notification.permission;
      if (permission === 'granted') {
        flushNotificationQueue();
        try {
          new window.Notification(title, notificationOptions);
        } catch {
          // Ignore notification errors.
        }
        return;
      }
      if (permission === 'denied') {
        return;
      }
      enqueueNotification({ key, title, options: notificationOptions });
      void requestNotificationPermissionIfNeeded();
    },
    [enqueueNotification, flushNotificationQueue, requestNotificationPermissionIfNeeded],
  );

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
      if (pendingNotificationsRef.current.length > 0) {
        const filteredNotifications = pendingNotificationsRef.current.filter(
          (entry) => entry.key !== key,
        );
        if (filteredNotifications.length !== pendingNotificationsRef.current.length) {
          pendingNotificationsRef.current = filteredNotifications;
        }
      }
    },
    [setIdleAcknowledgementsSnapshot, setSessionMetadataSnapshot],
  );

  const syncKnownSessions = useCallback((sessions: any[]) => {
    const previousMetadata = sessionMetadataRef.current;
    const previousAcknowledgements = idleAcknowledgementsRef.current;
    const previousNotificationMarkers = idleNotificationMarkersRef.current;
    const nextNotificationMarkers = new Map<string, number | null>();
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
        const sessionTabs = normaliseSessionTabs(item.sessions);
        const existing = aggregated.get(key);
        if (!existing) {
          aggregated.set(key, {
            org,
            repo,
            branch,
            idle,
            lastActivityAtMs,
            sessions: sessionTabs,
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
        existing.sessions = sessionTabs;
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
        sessions: Array.isArray(value.sessions) ? value.sessions : [],
      });

      const previous = previousMetadata.get(key);
      const previousIdle = Boolean(previous?.idle);
      const previousNotifiedMarker = previousNotificationMarkers.has(key)
        ? previousNotificationMarkers.get(key) ?? null
        : null;
      const acknowledgementEntry = previousAcknowledgements.get(key);
      const acknowledgementCurrent = isIdleAcknowledgementCurrent(value, acknowledgementEntry);
      const shouldNotify =
        value.branch !== 'main' && value.idle && !acknowledgementCurrent;
      if (shouldNotify) {
        const activityMarker = isFiniteNumber(lastActivityAtMs) ? lastActivityAtMs : null;
        const hasNotifiedBefore = previousNotificationMarkers.has(key);
        const isSameActivity = hasNotifiedBefore && previousNotifiedMarker === activityMarker;
        nextNotificationMarkers.set(key, activityMarker);
        if (!previousIdle || !hasNotifiedBefore || !isSameActivity) {
          deliverIdleNotification(key, value.org, value.repo, value.branch);
        }
      }
    });

    knownSessionsRef.current = nextKnownSessions;
    sessionMetadataRef.current = nextMetadata;
    setSessionMetadataSnapshot(new Map(nextMetadata));
    idleNotificationMarkersRef.current = nextNotificationMarkers;

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
  }, [deliverIdleNotification, normaliseSessionTabs]);

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
