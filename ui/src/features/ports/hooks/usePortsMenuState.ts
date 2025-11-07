import { useCallback, useEffect, useRef, useState } from 'react';
import { isAuthenticationError } from '../../../services/api/api-client.js';
import * as portsService from '../../../services/api/portsService.js';

export const DEFAULT_PORTS_MENU_POLL_INTERVAL = 8000;

interface UsePortsMenuStateOptions {
  onAuthExpired?: () => void;
  pollInterval?: number;
}

interface LoadPortsOptions {
  background?: boolean;
}

export function usePortsMenuState({
  onAuthExpired,
  pollInterval = DEFAULT_PORTS_MENU_POLL_INTERVAL,
}: UsePortsMenuStateOptions = {}) {
  const [ports, setPorts] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tunnelError, setTunnelError] = useState<string | null>(null);
  const [tunnels, setTunnels] = useState<Record<number, portsService.PortTunnel>>({});
  const [pendingPort, setPendingPort] = useState<number | null>(null);
  const [copiedPort, setCopiedPort] = useState<number | null>(null);

  const pollTimerRef = useRef<number | null>(null);
  const resetCopyTimerRef = useRef<number | null>(null);

  const clearPollTimer = useCallback(() => {
    if (typeof window === 'undefined') {
      pollTimerRef.current = null;
      return;
    }
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const clearCopyTimer = useCallback(() => {
    if (typeof window === 'undefined') {
      resetCopyTimerRef.current = null;
      return;
    }
    if (resetCopyTimerRef.current !== null) {
      window.clearTimeout(resetCopyTimerRef.current);
      resetCopyTimerRef.current = null;
    }
  }, []);

  const loadPorts = useCallback(
    async ({ background = false }: LoadPortsOptions = {}) => {
      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const nextPorts = await portsService.fetchPorts();
        setPorts(nextPorts);
        setError(null);
      } catch (err: unknown) {
        if (isAuthenticationError(err)) {
          onAuthExpired?.();
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to load ports';
        setError(message);
      } finally {
        if (background) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    },
    [onAuthExpired],
  );

  const startPolling = useCallback(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!pollInterval || pollInterval < 1000) {
      return;
    }
    clearPollTimer();
    pollTimerRef.current = window.setInterval(() => {
      loadPorts({ background: true }).catch(() => {});
    }, pollInterval);
  }, [clearPollTimer, loadPorts, pollInterval]);

  const openTunnel = useCallback(
    async (port: number) => {
      setPendingPort(port);
      setTunnelError(null);
      try {
        const tunnel = await portsService.openPortTunnel(port);
        setTunnels((current) => ({ ...current, [port]: tunnel }));
      } catch (err: unknown) {
        if (isAuthenticationError(err)) {
          onAuthExpired?.();
          return;
        }
        const message = err instanceof Error ? err.message : 'Failed to open tunnel';
        setTunnelError(message);
      } finally {
        setPendingPort(null);
      }
    },
    [onAuthExpired],
  );

  const copyTunnelUrl = useCallback((port: number, url: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setTunnelError('Clipboard API is unavailable in this environment.');
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedPort(port);
        clearCopyTimer();
        if (typeof window !== 'undefined') {
          resetCopyTimerRef.current = window.setTimeout(() => {
            setCopiedPort((current) => (current === port ? null : current));
            resetCopyTimerRef.current = null;
          }, 2000);
        }
      })
      .catch(() => {
        setTunnelError('Failed to copy tunnel URL to clipboard.');
      });
  }, [clearCopyTimer]);

  const handleMenuVisibilityChange = useCallback(
    (isOpen: boolean) => {
      if (isOpen) {
        loadPorts();
        startPolling();
      } else {
        clearPollTimer();
        setRefreshing(false);
        setCopiedPort(null);
      }
    },
    [clearPollTimer, loadPorts, startPolling],
  );

  useEffect(
    () => () => {
      clearPollTimer();
      clearCopyTimer();
    },
    [clearPollTimer, clearCopyTimer],
  );

  const clearTunnelErrorMessage = useCallback(() => {
    setTunnelError(null);
  }, []);

  return {
    ports,
    tunnels,
    loading,
    refreshing,
    error,
    tunnelError,
    pendingPort,
    copiedPort,
    refreshPorts: loadPorts,
    openTunnel,
    copyTunnelUrl,
    onMenuVisibilityChange: handleMenuVisibilityChange,
    clearTunnelError: clearTunnelErrorMessage,
  };
}
