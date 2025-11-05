import { useEffect, useRef } from 'react';

export interface UsePollingOptions {
  /**
   * Callback function to execute on each polling interval
   */
  callback: () => void | Promise<void>;
  
  /**
   * Polling interval in milliseconds
   */
  interval: number | null;
  
  /**
   * Whether polling is enabled
   * @default true
   */
  enabled?: boolean;
  
  /**
   * Pause polling when document is hidden (not visible)
   * @default false
   */
  pauseWhenHidden?: boolean;
  
  /**
   * Disable polling when realtime connection is active
   * @default false
   */
  disableWhenRealtime?: boolean;
  
  /**
   * Whether realtime connection is active
   */
  isRealtimeConnected?: boolean;
}

/**
 * Enhanced polling hook with visibility detection and realtime awareness
 * 
 * @param options - Polling configuration options
 * 
 * @example
 * ```tsx
 * usePolling({
 *   callback: fetchData,
 *   interval: 5000,
 *   pauseWhenHidden: true,
 *   disableWhenRealtime: true,
 *   isRealtimeConnected
 * });
 * ```
 */
export function usePolling({
  callback,
  interval,
  enabled = true,
  pauseWhenHidden = false,
  disableWhenRealtime = false,
  isRealtimeConnected = false,
}: UsePollingOptions): void {
  const savedCallback = useRef<(() => void | Promise<void>) | null>(callback);
  const inFlightRef = useRef(false);

  // Keep callback ref up to date
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    // Disable polling if not enabled, no interval, or realtime is active
    if (!enabled || !interval || (disableWhenRealtime && isRealtimeConnected)) {
      return () => {};
    }

    let timerId: number | null = null;
    let cancelled = false;

    const isDocumentVisible = () => 
      typeof document === 'undefined' || document.visibilityState !== 'hidden';

    const tick = async () => {
      if (cancelled || inFlightRef.current) {
        return;
      }
      
      // Skip if document is hidden and pause on hidden is enabled
      if (pauseWhenHidden && !isDocumentVisible()) {
        return;
      }

      if (savedCallback.current) {
        inFlightRef.current = true;
        try {
          await savedCallback.current();
        } catch (error) {
          console.error('Polling callback error:', error);
        } finally {
          inFlightRef.current = false;
        }
      }
    };

    // Set up interval
    timerId = window.setInterval(tick, interval);

    // Set up visibility change handler if needed
    let visibilityHandler: (() => void) | null = null;
    if (pauseWhenHidden && typeof document !== 'undefined') {
      visibilityHandler = () => {
        if (isDocumentVisible()) {
          // Resume polling when document becomes visible
          tick();
        }
      };
      document.addEventListener('visibilitychange', visibilityHandler);
    }

    return () => {
      cancelled = true;
      if (timerId !== null) {
        window.clearInterval(timerId);
      }
      if (visibilityHandler && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visibilityHandler);
      }
    };
  }, [interval, enabled, pauseWhenHidden, disableWhenRealtime, isRealtimeConnected]);
}

