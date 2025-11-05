/**
 * Hook for managing real-time event stream connection
 */

import { useEffect, useState } from 'react';
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

  useEffect(() => {
    const stop = createEventStream({
      onRepos: (payload: any) => {
        if (onRepos) {
          onRepos(payload);
        }
      },
      onSessions: (payload: any) => {
        if (onSessions) {
          onSessions(payload);
        }
      },
      onTasks: (payload: any) => {
        if (onTasks) {
          onTasks(payload);
        }
      },
      onConnect: () => {
        setIsConnected(true);
        if (onConnect) {
          onConnect();
        }
      },
      onDisconnect: () => {
        setIsConnected(false);
        if (onDisconnect) {
          onDisconnect();
        }
      },
    });

    return stop;
  }, [onRepos, onSessions, onTasks, onConnect, onDisconnect]);

  return {
    isConnected,
  };
}
