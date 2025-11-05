import { useEffect, useRef } from 'react';

/**
 * Custom hook to observe element resize
 */
export function useResizeObserver(
  callback: (entries: ResizeObserverEntry[]) => void,
  element: HTMLElement | null
): void {
  const savedCallback = useRef<((entries: ResizeObserverEntry[]) => void) | null>(callback);

  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!element) {
      return;
    }

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      if (savedCallback.current) {
        savedCallback.current(entries);
      }
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [element]);
}

