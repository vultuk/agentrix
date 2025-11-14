import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CodexSdkEvent, CodexSdkSessionMetadata } from '../../../types/codex-sdk.js';
import { renderMarkdown } from '../../../utils/markdown.js';

const { createElement: h } = React;

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnected';

interface CodexSdkChatPanelProps {
  events: CodexSdkEvent[];
  isSending: boolean;
  connectionState: ConnectionState;
  session: CodexSdkSessionMetadata | null;
  lastError: string | null;
  onSend: (text: string) => Promise<void> | void;
}

function renderEvent(event: CodexSdkEvent, index: number) {
  const key = 'id' in event && event.id ? `${event.type}-${event.id}` : `${event.type}-${index}`;
  switch (event.type) {
    case 'ready':
      return h(
        'div',
        { key, className: 'text-xs text-emerald-300/70 text-center' },
        event.message,
      );
    case 'user_message':
      return h(
        'div',
        { key, className: 'flex flex-col items-end text-right' },
              h('div', {
                className:
                  'inline-block max-w-[75%] rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 markdown-preview space-y-2',
                dangerouslySetInnerHTML: { __html: renderMarkdown(event.text) },
              }),
      );
    case 'thinking':
      return h(
        'div',
        { key, className: 'text-sm italic text-neutral-400' },
        h(
          'span',
          null,
          event.text || (event.status === 'completed' ? 'Finished thinking.' : 'Thinking…'),
        ),
      );
    case 'log':
      return h(
        'div',
        { key, className: 'text-[11px] text-neutral-500 font-mono' },
        event.message,
      );
    case 'agent_response':
      return h(
        'div',
        { key, className: 'flex flex-col items-start text-left' },
              h('div', {
                className:
                  'inline-block max-w-[75%] rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-100 markdown-preview space-y-2',
                dangerouslySetInnerHTML: { __html: renderMarkdown(event.text) },
              }),
      );
    case 'error':
      return h(
        'div',
        { key, className: 'text-sm text-rose-300 text-center' },
        event.message,
      );
    default:
      return null;
  }
}

function connectionLabel(state: ConnectionState): string {
  switch (state) {
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return 'Live';
    case 'disconnected':
      return 'Disconnected';
    default:
      return 'Idle';
  }
}

function connectionBadge(state: ConnectionState) {
  const color =
    state === 'connected'
      ? 'bg-emerald-400'
      : state === 'connecting'
      ? 'bg-amber-400'
      : 'bg-neutral-600';
  return h('span', {
    className: `inline-block h-2 w-2 rounded-full ${color}`,
    'aria-hidden': true,
  });
}

export default function CodexSdkChatPanel({
  events,
  isSending,
  connectionState,
  session,
  lastError,
  onSend,
}: CodexSdkChatPanelProps) {
  const [input, setInput] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    const isScrolledUp = remaining > 24;
    setIsUserScrolledUp(isScrolledUp);
    setShowScrollButton(isScrolledUp);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = container.scrollHeight;
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) {
      return;
    }
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  useEffect(() => {
    if (isUserScrolledUp) {
      setShowScrollButton(true);
      return;
    }
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
    setShowScrollButton(false);
  }, [events, isUserScrolledUp]);

  const scrollToBottom = useCallback(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
    setIsUserScrolledUp(false);
    setShowScrollButton(false);
  }, []);

  const disableInput = connectionState !== 'connected' || isSending;
  const canSubmit = !disableInput && input.trim().length > 0;

  const submitMessage = useCallback(async () => {
    if (!canSubmit) {
      return;
    }
    const trimmed = input.trim();
    try {
      await onSend(trimmed);
      setInput('');
    } catch (error) {
      console.error('[codex-sdk] Failed to send message', error);
      window.alert('Failed to send message to Codex SDK.');
    }
  }, [canSubmit, input, onSend]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      await submitMessage();
    },
    [submitMessage],
  );

  const renderedEvents = useMemo(() => events.map(renderEvent).filter(Boolean), [events]);

  if (!session) {
    return null;
  }

  return h(
    'div',
    { className: 'flex flex-col h-full bg-neutral-950 border border-neutral-900/80 rounded-md' },
    lastError
      ? h(
          'div',
          { className: 'bg-rose-500/10 px-4 py-2 text-xs text-rose-200 border-b border-rose-500/30' },
          lastError,
        )
      : null,
    h(
      'div',
      { className: 'relative flex-1 min-h-0' },
      h(
        'div',
        {
          ref: (node: HTMLDivElement | null) => {
            scrollRef.current = node;
            containerRef.current = node;
          },
          className:
            'absolute inset-0 overflow-y-auto px-4 py-4 pb-20 text-sm text-neutral-200 space-y-3',
        },
        renderedEvents.length > 0
          ? renderedEvents
          : h('p', { className: 'text-center text-neutral-500 text-sm' }, 'Codex is ready. Describe the change you need.'),
      ),
      showScrollButton
        ? h(
            'button',
            {
              type: 'button',
              onClick: scrollToBottom,
              className:
                'absolute bottom-12 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900/80 text-neutral-100 border border-neutral-700 shadow-lg hover:text-emerald-300 transition',
              title: 'Jump to latest message',
            },
            h(ChevronDown, { size: 18 }),
          )
        : null,
    ),
    h(
      'form',
      {
        onSubmit: handleSubmit,
        className: 'flex gap-2 border-t border-neutral-900 bg-neutral-925 px-4 py-3',
      },
      h('textarea', {
        value: input,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => setInput(event.target.value),
        rows: 2,
        placeholder: disableInput ? 'Connect to start chatting…' : 'Describe the next step…',
        disabled: disableInput,
        onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void submitMessage();
          }
        },
        className:
          'flex-1 resize-none rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-emerald-400/50 disabled:cursor-not-allowed disabled:opacity-60',
      }),
      h(
        'button',
        {
          type: 'submit',
          disabled: !canSubmit,
          className:
            'rounded-md bg-emerald-500/90 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500',
        },
        isSending ? 'Sending…' : 'Send',
      ),
    ),
  );
}
