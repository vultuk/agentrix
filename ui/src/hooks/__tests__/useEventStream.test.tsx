import React from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEventStream } from '../useEventStream.js';

const createEventStreamMock = vi.fn();

vi.mock('../../utils/eventStream.js', () => ({
  createEventStream: (...args: any[]) => createEventStreamMock(...args),
}));

describe('useEventStream', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    createEventStreamMock.mockReset();
  });

  it('keeps a single connection while handler props change', () => {
    const stop = vi.fn();
    createEventStreamMock.mockReturnValue(stop);
    const receivedVariants: string[] = [];

    function TestComponent({ variant }: { variant: string }) {
      useEventStream({
        onSessions: () => {
          receivedVariants.push(variant);
        },
      });
      return null;
    }

    const { rerender, unmount } = render(<TestComponent variant="first" />);
    expect(createEventStreamMock).toHaveBeenCalledTimes(1);

    rerender(<TestComponent variant="second" />);
    expect(createEventStreamMock).toHaveBeenCalledTimes(1);

    const streamHandlers = createEventStreamMock.mock.calls[0]?.[0] ?? {};
    streamHandlers.onSessions?.({ sessions: [] });
    expect(receivedVariants).toEqual(['second']);

    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('uses the latest connect/disconnect handlers without recreating the stream', () => {
    const stop = vi.fn();
    createEventStreamMock.mockReturnValue(stop);
    const events: string[] = [];

    function TestComponent({ variant }: { variant: string }) {
      useEventStream({
        onConnect: () => events.push(`${variant}:connect`),
        onDisconnect: () => events.push(`${variant}:disconnect`),
      });
      return null;
    }

    const { rerender, unmount } = render(<TestComponent variant="first" />);
    expect(createEventStreamMock).toHaveBeenCalledTimes(1);

    const streamHandlers = createEventStreamMock.mock.calls[0]?.[0] ?? {};
    streamHandlers.onConnect?.();
    expect(events).toEqual(['first:connect']);

    rerender(<TestComponent variant="second" />);
    streamHandlers.onDisconnect?.();
    expect(createEventStreamMock).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['first:connect', 'second:disconnect']);

    unmount();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
