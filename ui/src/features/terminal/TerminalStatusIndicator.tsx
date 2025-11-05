import React from 'react';

const { createElement: h } = React;

type TerminalStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

interface StatusConfig {
  label: string;
  className: string;
}

const STATUS_CONFIG: Record<TerminalStatus, StatusConfig> = {
  connected: {
    label: 'Connected',
    className: 'bg-emerald-500',
  },
  connecting: {
    label: 'Connecting...',
    className: 'bg-amber-500 animate-pulse',
  },
  disconnected: {
    label: 'Disconnected',
    className: 'bg-neutral-500',
  },
  error: {
    label: 'Error',
    className: 'bg-rose-500',
  },
};

interface TerminalStatusIndicatorProps {
  status?: TerminalStatus;
}

export default function TerminalStatusIndicator({ status = 'disconnected' }: TerminalStatusIndicatorProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;

  return h(
    'div',
    { className: 'flex items-center gap-2 text-xs text-neutral-400' },
    h('span', { className: `h-2 w-2 rounded-full ${config.className}` }),
    h('span', null, config.label)
  );
}

