import { useState, useRef, useCallback, useEffect } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import * as terminalService from '../../services/api/terminalService.js';

type TerminalStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

interface Worktree {
  org: string;
  repo: string;
  branch: string;
}

interface UseTerminalReturn {
  terminalStatus: TerminalStatus;
  setTerminalStatus: (status: TerminalStatus) => void;
  sessionId: string | null;
  setSessionId: (id: string | null) => void;
  activeWorktree: Worktree | null;
  setActiveWorktree: (worktree: Worktree | null) => void;
  terminalRef: React.MutableRefObject<Terminal | null>;
  fitAddonRef: React.MutableRefObject<FitAddon | null>;
  socketRef: React.MutableRefObject<WebSocket | null>;
  initTerminal: (containerElement: HTMLElement) => Terminal | undefined;
  connectTerminal: (org: string, repo: string, branch: string) => Promise<void>;
  disconnectTerminal: () => void;
}

/**
 * Custom hook for managing terminal state and xterm.js integration
 */
export function useTerminal(): UseTerminalReturn {
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>('disconnected');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeWorktree, setActiveWorktree] = useState<Worktree | null>(null);
  
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  /**
   * Initialize terminal instance
   */
  const initTerminal = useCallback((containerElement: HTMLElement): Terminal | undefined => {
    if (!containerElement || terminalRef.current) {
      return;
    }

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Cascadia Code", "Fira Code", "Courier New", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e5e5',
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(containerElement);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Setup resize observer
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        if (fitAddonRef.current) {
          try {
            fitAddonRef.current.fit();
          } catch (error) {
            console.warn('Failed to fit terminal', error);
          }
        }
      });
      observer.observe(containerElement);
      resizeObserverRef.current = observer;
    }

    return terminal;
  }, []);

  /**
   * Connect to terminal WebSocket
   */
  const connectTerminal = useCallback(async (org: string, repo: string, branch: string): Promise<void> => {
    if (!org || !repo || !branch) {
      return;
    }

    setTerminalStatus('connecting');
    setActiveWorktree({ org, repo, branch });

    try {
      // Open terminal session
      await terminalService.openTerminal(org, repo, branch);
      
      // Connect WebSocket
      const wsUrl = terminalService.getTerminalWebSocketUrl(org, repo, branch);
      const socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        setTerminalStatus('connected');
        setSessionId(`${org}::${repo}::${branch}`);
      };

      socket.onmessage = (event: MessageEvent) => {
        if (terminalRef.current && event.data) {
          terminalRef.current.write(event.data);
        }
      };

      socket.onerror = () => {
        setTerminalStatus('error');
      };

      socket.onclose = () => {
        setTerminalStatus('disconnected');
      };

      // Setup terminal input handling
      if (terminalRef.current) {
        terminalRef.current.onData((data: string) => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(data);
          }
        });
      }

      socketRef.current = socket;
    } catch (error) {
      console.error('Failed to connect terminal', error);
      setTerminalStatus('error');
    }
  }, []);

  /**
   * Disconnect terminal
   */
  const disconnectTerminal = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
    setTerminalStatus('disconnected');
    setSessionId(null);
  }, []);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      if (terminalRef.current) {
        terminalRef.current.dispose();
      }
    };
  }, []);

  return {
    terminalStatus,
    setTerminalStatus,
    sessionId,
    setSessionId,
    activeWorktree,
    setActiveWorktree,
    terminalRef,
    fitAddonRef,
    socketRef,
    initTerminal,
    connectTerminal,
    disconnectTerminal,
  };
}

