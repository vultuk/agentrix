import React, { useEffect } from 'react';
import { Menu, MenuButton, MenuItems } from '@headlessui/react';
import {
  ClipboardCopy,
  ExternalLink,
  Link,
  RefreshCcw,
  Server,
  X,
} from 'lucide-react';
import { ACTION_BUTTON_CLASS } from '../../../utils/constants.js';
import { renderSpinner } from '../../../components/Spinner.js';
import { usePortsMenuState } from '../hooks/usePortsMenuState.js';

const { createElement: h, Fragment } = React;

interface PortsMenuProps {
  onAuthExpired?: () => void;
  pollInterval?: number;
}

interface MenuStateTrackerProps {
  open: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

function MenuStateTracker({ open, onOpenChange }: MenuStateTrackerProps) {
  useEffect(() => {
    onOpenChange(open);
  }, [open, onOpenChange]);
  return null;
}

export function PortsMenu({ onAuthExpired, pollInterval }: PortsMenuProps) {
  const {
    ports,
    tunnels,
    loading,
    refreshing,
    error,
    tunnelError,
    pendingPort,
    copiedPort,
    refreshPorts,
    openTunnel,
    copyTunnelUrl,
    onMenuVisibilityChange,
  } = usePortsMenuState({
    onAuthExpired,
    pollInterval,
  });

  const hasPorts = ports.length > 0;
  const isBusy = loading || refreshing;

  return h(
    Menu,
    { as: 'div', className: 'relative inline-flex' },
    ({ open, close }: { open: boolean; close: () => void }) =>
      h(
        Fragment,
        null,
        h(MenuStateTracker, {
          open,
          onOpenChange: onMenuVisibilityChange,
        }),
        h(
          MenuButton,
          {
            className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`,
            title: 'Manage port tunnels',
          },
          isBusy ? renderSpinner('text-neutral-100') : h(Server, { size: 16 }),
        ),
        h(
          MenuItems,
          {
            className:
              'absolute right-0 top-full z-40 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950 shadow-2xl focus:outline-none',
          },
          h(
            'div',
            {
              className:
                'flex items-center justify-between border-b border-neutral-800 bg-neutral-900/80 px-4 py-3',
            },
            h(
              'div',
              null,
              h('p', { className: 'text-sm font-semibold text-neutral-100' }, 'Ports'),
              h('p', { className: 'text-xs text-neutral-400' }, 'Active TCP listeners'),
            ),
            h(
              'div',
              { className: 'flex items-center gap-2' },
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => refreshPorts(),
                  disabled: isBusy,
                  className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60`,
                  title: 'Refresh ports',
                },
                isBusy ? renderSpinner('text-neutral-100') : h(RefreshCcw, { size: 16 }),
              ),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => close(),
                  className: `${ACTION_BUTTON_CLASS} text-neutral-400 hover:text-neutral-100`,
                  title: 'Close menu',
                },
                h(X, { size: 16 }),
              ),
            ),
          ),
          h(
            'div',
            { className: 'max-h-[60vh] overflow-y-auto px-4 py-3 space-y-4' },
            loading && !hasPorts && !error
              ? h(
                  'div',
                  { className: 'flex flex-col items-center justify-center gap-3 py-6 text-sm text-neutral-400' },
                  renderSpinner('text-neutral-100'),
                  h('span', null, 'Detecting active ports…'),
                )
              : null,
            !loading && error
              ? h(
                  'div',
                  { className: 'rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200' },
                  error,
                )
              : null,
            !loading && !error && !hasPorts
              ? h(
                  'div',
                  { className: 'py-4 text-sm text-neutral-500' },
                  'No active ports detected. Launch a service to expose it here.',
                )
              : null,
            hasPorts
              ? h(
                  'ul',
                  { className: 'divide-y divide-neutral-900/60 border border-neutral-900/60 rounded-md' },
                  ports.map((port) => {
                    const tunnel = tunnels[port];
                    const isPending = pendingPort === port;
                    const copyState = copiedPort === port;
                    return h(
                      'li',
                      { key: port, className: 'px-4 py-3' },
                      h(
                        'div',
                        { className: 'flex items-start justify-between gap-3' },
                        h(
                          'div',
                          { className: 'min-w-0' },
                          h(
                            'p',
                            { className: 'text-sm font-medium text-neutral-100' },
                            `Port ${port}`,
                          ),
                          tunnel
                            ? h(
                                'div',
                                { className: 'mt-1 space-y-1 text-xs text-neutral-400' },
                                h(
                                  'a',
                                  {
                                    href: tunnel.url,
                                    target: '_blank',
                                    rel: 'noreferrer',
                                    className: 'inline-flex items-center gap-1 text-sky-400 hover:text-sky-200 break-all',
                                  },
                                  h(ExternalLink, { size: 12 }),
                                  tunnel.url,
                                ),
                                h(
                                  'p',
                                  { className: 'text-[11px] uppercase tracking-wide text-neutral-500' },
                                  `Created ${new Date(tunnel.createdAt).toLocaleTimeString()}`,
                                ),
                              )
                            : h(
                                'p',
                                { className: 'text-xs text-neutral-500' },
                                'Click to create an ngrok tunnel.',
                              ),
                        ),
                        h(
                          'div',
                          { className: 'flex flex-col items-end gap-2' },
                          h(
                            'button',
                            {
                              type: 'button',
                              onClick: () => openTunnel(port),
                              className:
                                'inline-flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-925 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-200 transition hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60',
                              disabled: isPending,
                            },
                            isPending ? renderSpinner('text-neutral-100') : h(Link, { size: 14 }),
                            tunnel ? 'Recreate' : 'Expose',
                          ),
                          tunnel
                            ? h(
                                'button',
                                {
                                  type: 'button',
                                  onClick: () => copyTunnelUrl(port, tunnel.url),
                                  className:
                                    'inline-flex items-center gap-2 text-[11px] uppercase tracking-wide text-neutral-400 transition hover:text-neutral-200',
                                },
                                h(ClipboardCopy, { size: 12 }),
                                copyState ? 'Copied' : 'Copy URL',
                              )
                            : null,
                        ),
                      ),
                    );
                  }),
                )
              : null,
            tunnelError
              ? h(
                  'div',
                  { className: 'rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200' },
                  tunnelError,
                )
              : null,
          ),
        ),
      ),
  );
}
