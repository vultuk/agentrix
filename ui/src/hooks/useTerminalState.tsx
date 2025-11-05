import { useState, useCallback } from 'react';

interface Worktree {
  org: string;
  repo: string;
  branch: string;
}

type TerminalStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export function useTerminalState() {
  const [terminalStatus, setTerminalStatus] = useState<TerminalStatus>('disconnected');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [activeWorktree, setActiveWorktree] = useState<Worktree | null>(null);

  const resetTerminal = useCallback(() => {
    setTerminalStatus('disconnected');
    setSessionId(null);
    setActiveWorktree(null);
  }, []);

  const activateWorktree = useCallback((worktree: Worktree, id: string) => {
    setActiveWorktree(worktree);
    setSessionId(id);
    setTerminalStatus('connecting');
  }, []);

  const updateStatus = useCallback((status: TerminalStatus) => {
    setTerminalStatus(status);
  }, []);

  return {
    terminalStatus,
    sessionId,
    activeWorktree,
    setTerminalStatus,
    setSessionId,
    setActiveWorktree,
    resetTerminal,
    activateWorktree,
    updateStatus,
  };
}

