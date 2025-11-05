/**
 * Shared utilities for React hooks
 */

import { useCallback } from 'react';
import { isAuthenticationError } from '../services/api/api-client.js';

/**
 * Creates a standardized authentication error handler
 * 
 * @param onAuthExpired - Callback to invoke when authentication expires
 * @returns Error handler function that checks for auth errors
 * 
 * @example
 * ```tsx
 * const handleAuthError = createAuthErrorHandler(onAuthExpired);
 * 
 * try {
 *   await someApiCall();
 * } catch (error) {
 *   if (handleAuthError(error)) return;
 *   // Handle other errors
 * }
 * ```
 */
export function createAuthErrorHandler(onAuthExpired?: () => void) {
  return (error: unknown): boolean => {
    if (isAuthenticationError(error)) {
      if (onAuthExpired) {
        onAuthExpired();
      }
      return true;
    }
    return false;
  };
}

/**
 * Hook that creates a memoized auth error handler
 * 
 * @param onAuthExpired - Callback to invoke when authentication expires
 * @returns Memoized error handler function
 */
export function useAuthErrorHandler(onAuthExpired?: () => void) {
  return useCallback(
    (error: unknown): boolean => {
      if (isAuthenticationError(error)) {
        if (onAuthExpired) {
          onAuthExpired();
        }
        return true;
      }
      return false;
    },
    [onAuthExpired]
  );
}

/**
 * Check if document is currently visible
 * 
 * @returns true if document is visible or in server environment
 */
export function isDocumentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/**
 * Creates a visibility change handler function
 * 
 * @param onVisible - Callback to invoke when document becomes visible
 * @param onHidden - Optional callback to invoke when document becomes hidden
 * @returns Visibility change handler
 */
export function createVisibilityChangeHandler(
  onVisible: () => void,
  onHidden?: () => void
): () => void {
  return () => {
    if (typeof document === 'undefined') {
      return;
    }
    
    if (document.visibilityState === 'visible') {
      onVisible();
    } else if (onHidden && document.visibilityState === 'hidden') {
      onHidden();
    }
  };
}

/**
 * Safely handle async operations with error logging
 * 
 * @param fn - Async function to execute
 * @param errorMessage - Optional custom error message
 * @returns Promise that won't throw
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  errorMessage?: string
): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    console.error(errorMessage || 'Async operation failed:', error);
    return null;
  }
}

