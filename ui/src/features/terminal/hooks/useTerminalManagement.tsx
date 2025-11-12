/**
 * Hook for managing terminal sessions, WebSocket connections, and xterm.js
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import * as terminalService from '../../../services/api/terminalService.js';
import { isAuthenticationError } from '../../../services/api/api-client.js';
import { useTheme } from '../../../context/ThemeContext.js';
import type { Worktree } from '../../../types/domain.js';

type TerminalStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'closed';

interface UseTerminalManagementOptions {
  onAuthExpired?: () => void;
  onSessionRemoved?: (key: string) => void;
}

export function useTerminalManagement({ onAuthExpired, onSessionRemoved }: UseTerminalManagementOptions = {}) {
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>('disconnected');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const { mode } = useTheme();
  const terminalTheme = useMemo(
    () =>
      mode === 'light'
        ? {
            background: '#f8fafc',
            foreground: '#1f2937',
            cursor: '#0f172a',
            selection: '#cbd5e1',
            black: '#020617',
            red: '#dc2626',
            green: '#15803d',
            yellow: '#b45309',
            blue: '#1d4ed8',
            magenta: '#7c3aed',
            cyan: '#0f766e',
            white: '#475569',
            brightBlack: '#94a3b8',
            brightRed: '#ef4444',
            brightGreen: '#22c55e',
            brightYellow: '#f59e0b',
            brightBlue: '#2563eb',
            brightMagenta: '#a855f7',
            brightCyan: '#2dd4bf',
            brightWhite: '#0f172a',
          }
        : {
            background: '#111111',
            foreground: '#f4f4f5',
            cursor: '#f4f4f5',
            selection: '#1f2937',
            black: '#1f1f1f',
            red: '#f87171',
            green: '#4ade80',
            yellow: '#facc15',
            blue: '#60a5fa',
            magenta: '#a855f7',
            cyan: '#22d3ee',
            white: '#f4f4f5',
            brightBlack: '#52525b',
            brightRed: '#fca5a5',
            brightGreen: '#86efac',
            brightYellow: '#fde047',
            brightBlue: '#93c5fd',
            brightMagenta: '#d8b4fe',
            brightCyan: '#67e8f9',
            brightWhite: '#fafafa',
          },
    [mode],
  );

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

  const pendingSetupRef = useRef<{ log: string; attempts: number } | null>(null);

  const initializeTerminal = useCallback(
    (initialLog: string) => {
      disposeTerminal();
      if (!terminalContainerRef.current) {
        return false;
      }
      const term = new Terminal({
        allowTransparency: true,
        convertEol: true,
        cursorBlink: true,
        fontFamily: 'JetBrains Mono, Menlo, Consolas, monospace',
        fontSize: 13,
        theme: terminalTheme,
        scrollback: 8000,
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
        if (!data || data.length === 0) {
          return;
        }
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
      return true;
    },
    [disposeTerminal, sendResize, terminalTheme],
  );

  const scheduleDeferredSetup = useCallback(() => {
    if (!pendingSetupRef.current) {
      return;
    }
    requestAnimationFrame(() => {
      const pending = pendingSetupRef.current;
      if (!pending) {
        return;
      }
      if (terminalContainerRef.current && initializeTerminal(pending.log)) {
        pendingSetupRef.current = null;
        return;
      }
      if (pending.attempts <= 0) {
        pendingSetupRef.current = null;
        return;
      }
      pending.attempts -= 1;
      scheduleDeferredSetup();
    });
  }, [initializeTerminal]);

  const setupTerminal = useCallback(
    (initialLog: string) => {
      if (terminalContainerRef.current) {
        initializeTerminal(initialLog);
        return;
      }
      pendingSetupRef.current = { log: initialLog, attempts: 10 };
      scheduleDeferredSetup();
    },
    [initializeTerminal, scheduleDeferredSetup],
  );

  useEffect(() => {
    const term = terminalRef.current;
    if (!term) {
      return;
    }
    term.options.theme = terminalTheme;
    term.refresh(0, term.rows - 1);
  }, [terminalTheme]);

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
      if (typeof event.data !== 'string') {
        return;
      }
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
        if (terminalRef.current) {
          const chunk = typeof payload.chunk === 'string' ? payload.chunk : '';
          if (chunk) {
            terminalRef.current.write(chunk);
          }
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
        const log = typeof payload.log === 'string' ? payload.log : '';
        if (!initSuppressedRef.current && log && terminalRef.current) {
          terminalRef.current.write(log);
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

  const openTerminal = useCallback(async (worktree: Worktree | null, options: { command?: string | null; prompt?: string | null; sessionId?: string | null; newSession?: boolean; sessionTool?: 'terminal' | 'agent' } = {}) => {
    const { command, prompt, sessionId, newSession, sessionTool } = options;
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
      const result = await terminalService.openTerminal(worktree.org, worktree.repo, worktree.branch, {
        command,
        prompt,
        sessionId,
        newSession,
        sessionTool,
      });
      
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
