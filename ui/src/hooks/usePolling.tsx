import { useEffect, useRef } from 'react';

/**
 * Custom hook for polling with interval
 */
export function usePolling(
  callback: () => void,
  interval: number | null,
  enabled = true
): void {
  const savedCallback = useRef<(() => void) | null>(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled || !interval) {
      return;
    }

    const tick = () => {
      if (savedCallback.current) {
        savedCallback.current();
      }
    };

    const id = setInterval(tick, interval);
    return () => clearInterval(id);
  }, [interval, enabled]);
}

