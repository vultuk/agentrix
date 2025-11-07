/**
 * Hook for managing real-time event stream connection
 */

import { useEffect, useRef, useState } from 'react';
import { createEventStream } from '../utils/eventStream.js';

interface UseEventStreamOptions {
  onRepos?: (payload: any) => void;
  onSessions?: (payload: any) => void;
  onTasks?: (payload: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useEventStream({
  onRepos,
  onSessions,
  onTasks,
  onConnect,
  onDisconnect,
}: UseEventStreamOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const handlersRef = useRef({
    onRepos,
    onSessions,
    onTasks,
    onConnect,
    onDisconnect,
  });

  useEffect(() => {
    handlersRef.current = {
      onRepos,
      onSessions,
      onTasks,
      onConnect,
      onDisconnect,
    };
  }, [onRepos, onSessions, onTasks, onConnect, onDisconnect]);

  useEffect(() => {
    const stop = createEventStream({
      onRepos: (payload: any) => {
        const handler = handlersRef.current.onRepos;
        if (handler) {
          handler(payload);
        }
      },
      onSessions: (payload: any) => {
        const handler = handlersRef.current.onSessions;
        if (handler) {
          handler(payload);
        }
      },
      onTasks: (payload: any) => {
        const handler = handlersRef.current.onTasks;
        if (handler) {
          handler(payload);
        }
      },
      onConnect: () => {
        setIsConnected(true);
        const handler = handlersRef.current.onConnect;
        if (handler) {
          handler();
        }
      },
      onDisconnect: () => {
        setIsConnected(false);
        const handler = handlersRef.current.onDisconnect;
        if (handler) {
          handler();
        }
      },
    });

    return stop;
  }, []);

  return {
    isConnected,
  };
}
