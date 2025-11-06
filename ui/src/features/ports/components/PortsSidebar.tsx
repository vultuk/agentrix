import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Resizable } from 're-resizable';
import {
  ExternalLink,
  Link,
  RefreshCcw,
  XCircle,
  ClipboardCopy,
} from 'lucide-react';
import { renderSpinner } from '../../../components/Spinner.js';
import { useTheme } from '../../../context/ThemeContext.js';
import { isAuthenticationError } from '../../../services/api/api-client.js';
import * as portsService from '../../../services/api/portsService.js';
import { ACTION_BUTTON_CLASS } from '../../../utils/constants.js';

const SIDEBAR_WIDTH_STORAGE_KEY = 'agentrix:ports-sidebar-width';
const DEFAULT_WIDTH = 320;
const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const MIN_TERMINAL_WIDTH = 520;
const DEFAULT_POLL_INTERVAL = 8000;

function clampWidth(value: number, min = MIN_WIDTH, max = MAX_WIDTH): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

function readStoredSidebarWidth(): number {
  if (typeof window === 'undefined') {
    return DEFAULT_WIDTH;
  }
  try {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_WIDTH;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      return DEFAULT_WIDTH;
    }
    return clampWidth(parsed);
  } catch {
    return DEFAULT_WIDTH;
  }
}

interface PortsSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthExpired?: () => void;
  pollInterval?: number;
}

export default function PortsSidebar({
  isOpen,
  onClose,
  onAuthExpired,
  pollInterval = DEFAULT_POLL_INTERVAL,
}: PortsSidebarProps) {
  const { mode } = useTheme();
  const [sidebarWidth, setSidebarWidth] = useState(() => readStoredSidebarWidth());
  const [viewportWidth, setViewportWidth] = useState(
    typeof window === 'undefined' ? 1440 : window.innerWidth,
  );
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

  const persistSidebarWidth = useCallback((value: number) => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(value));
    } catch {
      // ignore persistence errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return () => {};
    }
    const handler = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('resize', handler);
    };
  }, []);

  const maxSidebarWidth = useMemo(() => {
    if (typeof window === 'undefined') {
      return MAX_WIDTH;
    }
    const available = Math.max(viewportWidth - MIN_TERMINAL_WIDTH, MIN_WIDTH);
    return clampWidth(available, MIN_WIDTH, MAX_WIDTH);
  }, [viewportWidth]);

  const minSidebarWidth = useMemo(() => Math.min(MIN_WIDTH, maxSidebarWidth), [maxSidebarWidth]);

  useEffect(() => {
    const clamped = clampWidth(sidebarWidth, minSidebarWidth, maxSidebarWidth);
    if (clamped !== sidebarWidth) {
      setSidebarWidth(clamped);
      persistSidebarWidth(clamped);
    }
  }, [sidebarWidth, minSidebarWidth, maxSidebarWidth, persistSidebarWidth]);

  const loadPorts = useCallback(
    async (options: { background?: boolean } = {}) => {
      const { background = false } = options;
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

  useEffect(() => {
    if (!isOpen) {
      setLoading(false);
      setRefreshing(false);
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return () => {};
    }

    loadPorts();
    if (!pollInterval || pollInterval < 1000) {
      return () => {};
    }

    pollTimerRef.current = window.setInterval(() => {
      loadPorts({ background: true }).catch(() => {});
    }, pollInterval);

    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isOpen, loadPorts, pollInterval]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
      }
      if (resetCopyTimerRef.current !== null) {
        window.clearTimeout(resetCopyTimerRef.current);
      }
    };
  }, []);

  const handleOpenTunnel = useCallback(
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

  const handleCopyUrl = useCallback((port: number, url: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setTunnelError('Clipboard API is unavailable in this environment.');
      return;
    }
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedPort(port);
        if (resetCopyTimerRef.current !== null) {
          window.clearTimeout(resetCopyTimerRef.current);
        }
        resetCopyTimerRef.current = window.setTimeout(() => {
          setCopiedPort((current) => (current === port ? null : current));
        }, 2000);
      })
      .catch(() => {
        setTunnelError('Failed to copy tunnel URL to clipboard.');
      });
  }, []);

  const sidebarClasses =
    mode === 'light'
      ? 'bg-neutral-100 text-neutral-900 border-neutral-200'
      : 'bg-neutral-925 text-neutral-100 border-neutral-800';

  return (
    <Resizable
      enable={{ left: true }}
      minWidth={isOpen ? minSidebarWidth : 0}
      maxWidth={isOpen ? maxSidebarWidth : 0}
      size={{
        width: isOpen ? sidebarWidth : 0,
        height: '100%',
      }}
      onResizeStop={(_, __, ___, delta) => {
        if (!isOpen) {
          return;
        }
        const nextWidth = clampWidth(sidebarWidth + delta.width, minSidebarWidth, maxSidebarWidth);
        setSidebarWidth(nextWidth);
        persistSidebarWidth(nextWidth);
      }}
      handleClasses={{
        left: 'hidden lg:block w-1 cursor-col-resize border-l border-neutral-800/70 bg-neutral-800/40 hover:bg-neutral-700/70 transition-colors',
      }}
      className={`hidden lg:flex h-full flex-col border-l transition-all duration-200 ease-in-out ${sidebarClasses} ${
        isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <div className="flex items-center justify-between border-b border-neutral-800/60 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-neutral-200">Ports</p>
          <p className="text-xs text-neutral-500">Active TCP listeners</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadPorts()}
            className={`${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`}
            title="Refresh ports"
            disabled={loading || refreshing}
          >
            {loading || refreshing ? renderSpinner('text-neutral-100') : <RefreshCcw size={16} />}
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`}
            title="Close ports sidebar"
          >
            <XCircle size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && ports.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-neutral-400">
            {renderSpinner('text-neutral-100')}
            <span>Loading active ports…</span>
          </div>
        ) : null}

        {!loading && error ? (
          <div className="px-4 py-3">
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              {error}
            </div>
          </div>
        ) : null}

        {!loading && !error && ports.length === 0 ? (
          <div className="px-4 py-6 text-sm text-neutral-500">
            No active ports detected. Launch a service to expose it here.
          </div>
        ) : null}

        <ul className="divide-y divide-neutral-800/60">
          {ports.map((port) => {
            const tunnel = tunnels[port];
            const isPortPending = pendingPort === port;
            const copyState = copiedPort === port;
            return (
              <li key={port} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-100">Port {port}</p>
                    {tunnel ? (
                      <div className="mt-1 space-y-1 text-xs text-neutral-400">
                        <a
                          href={tunnel.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-200"
                        >
                          <ExternalLink size={12} />
                          <span className="break-all">{tunnel.url}</span>
                        </a>
                        <p className="text-[11px] uppercase tracking-wide text-neutral-500">
                          Created {new Date(tunnel.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-neutral-500">Click to create an ngrok tunnel.</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenTunnel(port)}
                      className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-neutral-200 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isPortPending}
                    >
                      {isPortPending ? renderSpinner('text-neutral-100') : <Link size={14} />}
                      <span>{tunnel ? 'Recreate' : 'Expose'}</span>
                    </button>
                    {tunnel ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-neutral-400 transition hover:text-neutral-200"
                        onClick={() => handleCopyUrl(port, tunnel.url)}
                      >
                        <ClipboardCopy size={12} />
                        <span>{copyState ? 'Copied' : 'Copy URL'}</span>
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {tunnelError ? (
          <div className="px-4 py-3">
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {tunnelError}
            </div>
          </div>
        ) : null}
      </div>
    </Resizable>
  );
}
