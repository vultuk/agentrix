import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCodexSession, getCodexSdkSocketUrl } from '../../../services/api/codexSdkService.js';
import { isAuthenticationError } from '../../../services/api/api-client.js';
import type { CodexSdkEvent, CodexSdkSessionMetadata } from '../../../types/codex-sdk.js';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

interface UsePlanCodexSessionOptions {
  sessionId: string | null;
  onAuthExpired?: () => void;
}

export function usePlanCodexSession({ sessionId, onAuthExpired }: UsePlanCodexSessionOptions) {
  const [session, setSession] = useState<CodexSdkSessionMetadata | null>(null);
  const [events, setEvents] = useState<CodexSdkEvent[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
  const [isSending, setIsSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    setSession(null);
    setEvents([]);
    setConnectionState('idle');
    setLastError(null);
    if (!sessionId) {
      return;
    }
    let cancelled = false;
    const loadSession = async () => {
      try {
        const detail = await fetchCodexSession(sessionId);
        if (cancelled) {
          return;
        }
        setSession(detail.session);
        setEvents(detail.events ?? []);
        setLastError(null);
      } catch (error: any) {
        if (isAuthenticationError(error)) {
          onAuthExpired?.();
          return;
        }
        if (!cancelled) {
          setLastError(error?.message || 'Failed to load Codex session.');
        }
      }
    };
    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [onAuthExpired, sessionId]);

  useEffect(() => {
    if (!sessionId) {
      if (socketRef.current) {
        try {
          socketRef.current.close();
        } catch {
          // ignore
        }
      }
      socketRef.current = null;
      return;
    }
    setConnectionState('connecting');
    try {
      const socket = new WebSocket(getCodexSdkSocketUrl(sessionId));
      socketRef.current = socket;
      socket.onopen = () => {
        setConnectionState('connected');
      };
      socket.onclose = () => {
        setConnectionState('disconnected');
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
      };
      socket.onerror = () => {
        setConnectionState('disconnected');
      };
      socket.onmessage = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'history' && Array.isArray(payload.events)) {
            setEvents(payload.events as CodexSdkEvent[]);
            setIsSending(false);
            setLastError(null);
            return;
          }
          if (payload.type === 'event' && payload.event) {
            const codexEvent = payload.event as CodexSdkEvent;
            setEvents((prev) => [...prev, codexEvent]);
            if (
              codexEvent.type === 'agent_response' ||
              codexEvent.type === 'error' ||
              codexEvent.type === 'usage'
            ) {
              setIsSending(false);
            }
            if (codexEvent.type === 'error') {
              setLastError(codexEvent.message);
            } else if (codexEvent.type === 'agent_response') {
              setLastError(null);
            }
            return;
          }
          if (payload.type === 'error' && typeof payload.message === 'string') {
            setLastError(payload.message);
            setIsSending(false);
          }
        } catch (error) {
          console.warn('[plan-mode] Failed to parse Codex payload', error);
        }
      };
    } catch (error) {
      console.error('[plan-mode] Failed to connect Codex socket', error);
      setConnectionState('disconnected');
    }
    return () => {
      const socket = socketRef.current;
      if (socket) {
        try {
          socket.close();
        } catch {
          // ignore
        }
      }
      socketRef.current = null;
    };
  }, [sessionId]);

  const sendMessage = useCallback(
    async (text: string) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        const errorByState: Record<ConnectionState, string> = {
          idle: 'Codex session is still initialising. Please wait a moment and try again.',
          connecting: 'Codex session is still connecting. Please wait for it to finish initialising.',
          connected: 'Codex session has not fully opened yet. Please retry in a moment.',
          disconnected: 'Codex session has disconnected. Please reopen the session before sending messages.',
        };
        const friendlyMessage =
          socket?.readyState === WebSocket.CONNECTING
            ? 'Codex session is establishing a connection. Try again shortly.'
            : errorByState[connectionState];
        throw new Error(friendlyMessage);
      }
      const trimmed = typeof text === 'string' ? text.trim() : '';
      if (!trimmed) {
        return;
      }
      setIsSending(true);
      setLastError(null);
      socket.send(JSON.stringify({ type: 'message', text: trimmed }));
    },
    [connectionState],
  );

  return {
    session,
    events,
    connectionState,
    isSending,
    lastError,
    sendMessage,
  };
}
