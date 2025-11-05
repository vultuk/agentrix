/**
 * Hook for managing terminal sessions, WebSocket connections, and xterm.js
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import * as terminalService from '../../../services/api/terminalService.js';
import { isAuthenticationError } from '../../../services/api/api-client.js';
import type { Worktree } from '../../../types/domain.js';

type TerminalStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'closed';

interface UseTerminalManagementOptions {
  onAuthExpired?: () => void;
  onSessionRemoved?: (key: string) => void;
}

export function useTerminalManagement({ onAuthExpired, onSessionRemoved }: UseTerminalManagementOptions = {}) {
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>('disconnected');
  const [sessionId, setSessionId] = useState<string | null>(null);

  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const initSuppressedRef = useRef(false);
  const closedByProcessRef = useRef(false);

  const sessionMapRef = useRef(new Map<string, string>());
  const sessionKeyByIdRef = useRef(new Map<string, string>());

  const sendResize = useCallback(() => {
    if (!terminalRef.current || !fitAddonRef.current) {
      return;
    }
    fitAddonRef.current.fit();
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const { cols, rows } = terminalRef.current;
      socketRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }, []);

  const disposeSocket = useCallback(() => {
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch (err) {
        // ignore
      }
      socketRef.current = null;
    }
  }, []);

  const disposeTerminal = useCallback(() => {
    if (terminalRef.current) {
      try {
        terminalRef.current.dispose();
      } catch (err) {
        // ignore
      }
      terminalRef.current = null;
    }
    fitAddonRef.current = null;
    if (terminalContainerRef.current) {
      terminalContainerRef.current.innerHTML = '';
    }
  }, []);

  const setupTerminal = useCallback((initialLog: string) => {
    disposeTerminal();
    if (!terminalContainerRef.current) {
      return;
    }
    const term = new Terminal({
      allowTransparency: true,
      convertEol: true,
      cursorBlink: true,
      fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
      fontSize: 13,
      theme: {
        background: '#111111',
        foreground: '#f4f4f5',
        cursor: '#f4f4f5'
      },
      scrollback: 8000
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    terminalRef.current = term;
    fitAddonRef.current = fitAddon;
    term.open(terminalContainerRef.current);
    term.focus();
    if (initialLog) {
      term.write(initialLog);
    }
    term.onData((data: string) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });
    term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });
    requestAnimationFrame(() => {
      sendResize();
      term.focus();
    });
  }, [disposeTerminal, sendResize]);

  const connectSocket = useCallback((newSessionId: string) => {
    if (!newSessionId) {
      return;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socketUrl = `${protocol}://${window.location.host}/api/terminal/socket?sessionId=${encodeURIComponent(
      newSessionId
    )}`;
    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      setTerminalStatus('connected');
      sendResize();
    });

    socket.addEventListener('message', (event: MessageEvent) => {
      let payload: any;
      try {
        payload = JSON.parse(event.data);
      } catch (err) {
        return;
      }
      if (payload.type === 'output') {
        if (payload.reset && terminalRef.current) {
          terminalRef.current.reset();
          sendResize();
        }
        if (terminalRef.current && payload.chunk) {
          terminalRef.current.write(payload.chunk);
        }
      } else if (payload.type === 'exit') {
        closedByProcessRef.current = true;
        setTerminalStatus('closed');
        const key = sessionKeyByIdRef.current.get(newSessionId);
        if (key) {
          sessionMapRef.current.delete(key);
          sessionKeyByIdRef.current.delete(newSessionId);
          if (onSessionRemoved) {
            onSessionRemoved(key);
          }
        }
      } else if (payload.type === 'init') {
        if (!initSuppressedRef.current && payload.log && terminalRef.current) {
          terminalRef.current.write(payload.log);
        }
        initSuppressedRef.current = false;
        if (payload.closed) {
          closedByProcessRef.current = true;
          setTerminalStatus('closed');
        }
      } else if (payload.type === 'error') {
        console.error(payload.message || 'Terminal connection error');
        setTerminalStatus('error');
        const key = sessionKeyByIdRef.current.get(newSessionId);
        if (key) {
          sessionMapRef.current.delete(key);
          sessionKeyByIdRef.current.delete(newSessionId);
          if (onSessionRemoved) {
            onSessionRemoved(key);
          }
        }
      }
    });

    socket.addEventListener('close', () => {
      if (closedByProcessRef.current) {
        setTerminalStatus('closed');
      } else {
        setTerminalStatus('disconnected');
      }
    });

    socket.addEventListener('error', () => {
      setTerminalStatus('error');
    });
  }, [sendResize, onSessionRemoved]);

  const openTerminal = useCallback(async (worktree: Worktree | null, options: { command?: string; prompt?: string } = {}) => {
    const { command, prompt } = options;
    disposeSocket();
    if (!worktree) {
      disposeTerminal();
      setSessionId(null);
      setTerminalStatus('disconnected');
      return;
    }
    setTerminalStatus('connecting');
    closedByProcessRef.current = false;
    initSuppressedRef.current = true;
    try {
      const result = await terminalService.openTerminal(
        worktree.org,
        worktree.repo,
        worktree.branch,
        command || null,
        prompt || null
      );
      
      const session = result.sessionId;
      const created = result.created;
      if (!session) {
        throw new Error('Invalid session response');
      }
      setSessionId(session);
      const worktreeKey = `${worktree.org}::${worktree.repo}::${worktree.branch}`;
      const previousSession = sessionMapRef.current.get(worktreeKey);
      if (previousSession && previousSession !== session) {
        sessionKeyByIdRef.current.delete(previousSession);
      }
      sessionMapRef.current.set(worktreeKey, session);
      sessionKeyByIdRef.current.set(session, worktreeKey);
      const initialLog = result.log || '';
      setupTerminal(initialLog);
      connectSocket(session);
      return { sessionId: session, created };
    } catch (error) {
      if (isAuthenticationError(error)) {
        if (onAuthExpired) {
          onAuthExpired();
        }
        throw new Error('AUTH_REQUIRED');
      }
      console.error('Failed to open terminal session', error);
      disposeTerminal();
      setSessionId(null);
      setTerminalStatus('error');
      throw error;
    }
  }, [connectSocket, disposeSocket, disposeTerminal, setupTerminal, onAuthExpired]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      disposeSocket();
      disposeTerminal();
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    },
    [disposeSocket, disposeTerminal]
  );

  // Setup resize observer
  useEffect(() => {
    if (!terminalContainerRef.current) {
      return;
    }
    const observer = new ResizeObserver(() => {
      sendResize();
    });
    observer.observe(terminalContainerRef.current);
    resizeObserverRef.current = observer;
    return () => observer.disconnect();
  }, [sendResize]);

  return {
    terminalContainerRef,
    terminalStatus,
    sessionId,
    sessionMapRef,
    sessionKeyByIdRef,
    openTerminal,
    disposeSocket,
    disposeTerminal,
    sendResize,
  };
}

