import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  listCodexSessions,
  createCodexSession,
  deleteCodexSession,
  getCodexSdkSocketUrl,
} from '../../../services/api/codexSdkService.js';
import type { CreateCodexSessionOptions } from '../../../services/api/codexSdkService.js';
import { isAuthenticationError } from '../../../services/api/api-client.js';
import type { Worktree } from '../../../types/domain.js';
import type { CodexSdkEvent, CodexSdkSessionSummary } from '../../../types/codex-sdk.js';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

interface UseCodexSdkChatOptions {
  activeWorktree: Worktree | null;
  onAuthExpired?: () => void;
}

function getWorktreeKey(worktree: Worktree | null): string | null {
  if (!worktree) {
    return null;
  }
  return `${worktree.org}/${worktree.repo}/${worktree.branch}`;
}

export function useCodexSdkChat({ activeWorktree, onAuthExpired }: UseCodexSdkChatOptions) {
  const [sessions, setSessions] = useState<CodexSdkSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [eventsBySession, setEventsBySession] = useState<Record<string, CodexSdkEvent[]>>({});
  const [connectionStateBySession, setConnectionStateBySession] = useState<Record<string, ConnectionState>>({});
  const [lastErrorBySession, setLastErrorBySession] = useState<Record<string, string | null>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [sendingSessions, setSendingSessions] = useState<Set<string>>(new Set());
const socketsRef = useRef<Map<string, WebSocket>>(new Map());

function isTurnPending(events: CodexSdkEvent[] | undefined): boolean {
  if (!events || events.length === 0) {
    return false;
  }
  let pending = false;
  for (const event of events) {
    if (event.type === 'user_message') {
      pending = true;
    } else if (event.type === 'agent_response' || event.type === 'error' || event.type === 'usage') {
      pending = false;
    }
  }
  return pending;
}
  const worktreeKeyRef = useRef<string | null>(null);

  const closeAllSockets = useCallback(() => {
    socketsRef.current.forEach((socket) => {
      try {
        socket.close();
      } catch {
        // ignore socket close errors
      }
    });
    socketsRef.current.clear();
  }, []);

  const clearState = useCallback(() => {
    setSessions([]);
    setEventsBySession({});
    setConnectionStateBySession({});
    setLastErrorBySession({});
    setActiveSessionId(null);
    setSendingSessions(new Set());
    setIsLoading(false);
  }, []);

  useEffect(() => {
    return () => {
      closeAllSockets();
    };
  }, [closeAllSockets]);

  const updateConnectionState = useCallback((sessionId: string, state: ConnectionState) => {
    setConnectionStateBySession((prev) => {
      if (prev[sessionId] === state) {
        return prev;
      }
      return { ...prev, [sessionId]: state };
    });
  }, []);

  const syncPendingFromEvents = useCallback((sessionId: string, events: CodexSdkEvent[] | undefined) => {
    setSendingSessions((prev) => {
      const next = new Set(prev);
      if (isTurnPending(events)) {
        next.add(sessionId);
      } else {
        next.delete(sessionId);
      }
      return next;
    });
  }, []);

  const markReplyPending = useCallback(
    (sessionId: string, pending: boolean) => {
      setSendingSessions((prev) => {
        const next = new Set(prev);
        if (pending) {
          next.add(sessionId);
        } else {
          next.delete(sessionId);
        }
        return next;
      });
    },
    [],
  );

  const updateSessionActivity = useCallback((sessionId: string, timestamp: string | undefined) => {
    if (!timestamp) {
      return;
    }
    setSessions((prev) =>
      prev.map((entry) => (entry.id === sessionId ? { ...entry, lastActivityAt: timestamp } : entry)),
    );
  }, []);

  const handleSocketMessage = useCallback(
    (sessionId: string, rawEvent: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(rawEvent.data);
            if (payload.type === 'history' && Array.isArray(payload.events)) {
              const historyEvents = payload.events as CodexSdkEvent[];
              setEventsBySession((prev) => ({ ...prev, [sessionId]: historyEvents }));
              syncPendingFromEvents(sessionId, historyEvents);
              const lastEvent = payload.events[payload.events.length - 1];
              updateSessionActivity(sessionId, lastEvent?.timestamp);
              setLastErrorBySession((prev) => ({ ...prev, [sessionId]: null }));
              return;
            }
        if (payload.type === 'event' && payload.event) {
          const codexEvent = payload.event as CodexSdkEvent;
              setEventsBySession((prev) => {
                const previous = prev[sessionId] || [];
                const updated = [...previous, codexEvent];
                syncPendingFromEvents(sessionId, updated);
                return { ...prev, [sessionId]: updated };
              });
              if (codexEvent.type === 'error') {
                setLastErrorBySession((prev) => ({ ...prev, [sessionId]: codexEvent.message }));
              } else if (codexEvent.type === 'agent_response' || codexEvent.type === 'ready') {
                setLastErrorBySession((prev) => ({ ...prev, [sessionId]: null }));
              }
              updateSessionActivity(sessionId, codexEvent.timestamp);
          return;
        }
        if (payload.type === 'error' && typeof payload.message === 'string') {
          setLastErrorBySession((prev) => ({ ...prev, [sessionId]: payload.message }));
          markReplyPending(sessionId, false);
        }
      } catch (error) {
        console.warn('[codex-sdk] Failed to parse socket payload', error);
      }
    },
    [markReplyPending, updateSessionActivity],
  );

  const connectSocket = useCallback(
    (sessionId: string) => {
      if (!sessionId || socketsRef.current.has(sessionId)) {
        return;
      }
      updateConnectionState(sessionId, 'connecting');
      try {
        const socket = new WebSocket(getCodexSdkSocketUrl(sessionId));
        socketsRef.current.set(sessionId, socket);

        socket.onopen = () => {
          updateConnectionState(sessionId, 'connected');
        };

        socket.onclose = () => {
          if (socketsRef.current.get(sessionId) === socket) {
            socketsRef.current.delete(sessionId);
          }
          updateConnectionState(sessionId, 'disconnected');
        };

        socket.onerror = () => {
          updateConnectionState(sessionId, 'disconnected');
        };

        socket.onmessage = (event) => handleSocketMessage(sessionId, event);
      } catch (error) {
        console.error('[codex-sdk] Failed to connect Codex socket', error);
        updateConnectionState(sessionId, 'disconnected');
      }
    },
    [handleSocketMessage, updateConnectionState],
  );

  const loadSessions = useCallback(
    async (worktree: Worktree) => {
      setIsLoading(true);
      try {
        const sessionList = await listCodexSessions(worktree.org, worktree.repo, worktree.branch);
        setSessions(sessionList);
        setEventsBySession((prev) => {
          const next: Record<string, CodexSdkEvent[]> = {};
          sessionList.forEach((session) => {
            if (prev[session.id]) {
              next[session.id] = prev[session.id];
            }
            syncPendingFromEvents(session.id, next[session.id]);
          });
          return next;
        });
        setConnectionStateBySession((prev) => {
          const next: Record<string, ConnectionState> = {};
          sessionList.forEach((session) => {
            if (prev[session.id]) {
              next[session.id] = prev[session.id];
            } else {
              next[session.id] = 'idle';
            }
          });
          return next;
        });
        setLastErrorBySession((prev) => {
          const next: Record<string, string | null> = {};
          sessionList.forEach((session) => {
            next[session.id] = prev[session.id] ?? null;
          });
          return next;
        });
        setActiveSessionId((current) => {
          if (current && sessionList.some((session) => session.id === current)) {
            return current;
          }
          return sessionList[0]?.id ?? null;
        });
        sessionList.forEach((session) => {
          connectSocket(session.id);
        });
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          onAuthExpired?.();
          return;
        }
        console.error('[codex-sdk] Failed to load Codex sessions', error);
        window.alert('Failed to load Codex SDK sessions. Check server logs for details.');
      } finally {
        setIsLoading(false);
      }
    },
    [connectSocket, onAuthExpired],
  );

  useEffect(() => {
    const key = getWorktreeKey(activeWorktree);
    if (!activeWorktree) {
      worktreeKeyRef.current = null;
      closeAllSockets();
      clearState();
      return;
    }
    if (worktreeKeyRef.current === key) {
      return;
    }
    worktreeKeyRef.current = key;
    closeAllSockets();
    clearState();
    void loadSessions(activeWorktree);
  }, [activeWorktree, clearState, closeAllSockets, loadSessions]);

  const refreshSessions = useCallback(async () => {
    if (!activeWorktree) {
      return;
    }
    await loadSessions(activeWorktree);
  }, [activeWorktree, loadSessions]);

  const createSessionForWorktree = useCallback(
    async (worktree: Worktree | null, options: CreateCodexSessionOptions = {}) => {
      if (!worktree) {
        return null;
      }
      try {
        const detail = await createCodexSession(worktree.org, worktree.repo, worktree.branch, options);
        const initialEvents = detail.events ?? [];
        setSessions((prev) => [...prev, detail.session]);
        setEventsBySession((prev) => ({ ...prev, [detail.session.id]: initialEvents }));
        syncPendingFromEvents(detail.session.id, initialEvents);
        setConnectionStateBySession((prev) => ({ ...prev, [detail.session.id]: 'idle' }));
        setLastErrorBySession((prev) => ({ ...prev, [detail.session.id]: null }));
        setActiveSessionId(detail.session.id);
        connectSocket(detail.session.id);
        return detail.session;
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          onAuthExpired?.();
          return null;
        }
        console.error('[codex-sdk] Failed to start Codex session', error);
        window.alert('Failed to start Codex SDK chat. Check server logs for details.');
        return null;
      }
    },
    [connectSocket, onAuthExpired],
  );

  const deleteSession = useCallback(
    async (sessionId: string) => {
      if (!sessionId) {
        return;
      }
      const socket = socketsRef.current.get(sessionId);
      if (socket) {
        try {
          socket.close();
        } catch {
          // ignore socket close errors
        }
        socketsRef.current.delete(sessionId);
      }
      try {
        await deleteCodexSession(sessionId);
        setSessions((prev) => {
          const next = prev.filter((entry) => entry.id !== sessionId);
          setActiveSessionId((current) => {
            if (current && current !== sessionId) {
              return current;
            }
            if (next.length === 0) {
              return null;
            }
            const previousIndex = prev.findIndex((entry) => entry.id === sessionId);
            if (previousIndex !== -1) {
              if (previousIndex < next.length) {
                return next[previousIndex].id;
              }
              if (previousIndex - 1 >= 0) {
                return next[previousIndex - 1].id;
              }
            }
            return next[0].id;
          });
          return next;
        });
        setEventsBySession((prev) => {
          if (!prev[sessionId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
        setSendingSessions((prev) => {
          if (!prev.has(sessionId)) {
            return prev;
          }
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
        setConnectionStateBySession((prev) => {
          if (!prev[sessionId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
        setLastErrorBySession((prev) => {
          if (!(sessionId in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[sessionId];
          return next;
        });
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          onAuthExpired?.();
          return;
        }
        console.error('[codex-sdk] Failed to delete Codex session', error);
        window.alert('Failed to close the Codex session. Check server logs for details.');
      }
    },
    [onAuthExpired],
  );

  const sendMessage = useCallback(
    async (sessionId: string, text: string) => {
      const socket = socketsRef.current.get(sessionId);
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error('Codex SDK connection is not ready');
      }
      const normalised = typeof text === 'string' ? text.trim() : '';
      if (!normalised) {
        return;
      }
      markReplyPending(sessionId, true);
      setLastErrorBySession((prev) => ({ ...prev, [sessionId]: null }));
      socket.send(JSON.stringify({ type: 'message', text: normalised }));
    },
    [markReplyPending],
  );

  const state = useMemo(() => {
    const activeSession =
      activeSessionId ? sessions.find((entry) => entry.id === activeSessionId) ?? null : null;
    const events = activeSessionId ? eventsBySession[activeSessionId] ?? [] : [];
    const connectionState = activeSessionId ? connectionStateBySession[activeSessionId] ?? 'idle' : 'idle';
    const lastError = activeSessionId ? lastErrorBySession[activeSessionId] ?? null : null;
    const isSending = activeSessionId ? sendingSessions.has(activeSessionId) : false;
    return {
      sessions,
      activeSessionId,
      activeSession,
      events,
      connectionState,
      lastError,
      isSending,
      isLoading,
      connectionStateBySession,
      lastErrorBySession,
    };
  }, [
    activeSessionId,
    connectionStateBySession,
    eventsBySession,
    isLoading,
    lastErrorBySession,
    sendingSessions,
    sessions,
  ]);

  return {
    ...state,
    refreshSessions,
    createSessionForWorktree,
    deleteSession,
    sendMessage,
    setActiveSessionId,
  };
}
