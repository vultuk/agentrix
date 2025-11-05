import type { ServerResponse } from 'node:http';
import { HttpError } from './http-error.js';
import { sendJson } from '../../utils/http.js';
import type { RequestContext } from '../../types/http.js';

/**
 * Type guard for HttpError
 */
function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}

/**
 * Type guard for errors with statusCode property
 */
function hasStatusCode(error: unknown): error is { statusCode: number; message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
  );
}

/**
 * Type guard for standard Error
 */
function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Extracts an error message from an unknown error object
 * @param error - Error object
 * @param defaultMessage - Default message if extraction fails
 * @returns Error message string
 */
export function extractErrorMessage(error: unknown, defaultMessage: string = 'An error occurred'): string {
  if (!error) {
    return defaultMessage;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  if (typeof error === 'object' && 'message' in error) {
    const err = error as { message?: unknown };
    if (typeof err.message === 'string') {
      return err.message;
    }
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  return defaultMessage;
}

/**
 * Centralized error handler that maps errors to HTTP responses
 */
export function handleError(
  res: ServerResponse,
  error: unknown,
  defaultStatusCode: number = 500
): void {
  // If it's already an HttpError, use its status code
  if (isHttpError(error)) {
    sendJson(res, error.statusCode, { error: error.message });
    return;
  }

  // Handle errors with explicit statusCode property
  if (hasStatusCode(error)) {
    const message = error.message || 'An error occurred';
    sendJson(res, error.statusCode, { error: message });
    return;
  }

  // Default error response
  const message = isError(error) ? error.message : 'An unexpected error occurred';
  sendJson(res, defaultStatusCode, { error: message });
}

/**
 * Wraps an async handler to catch errors and send appropriate HTTP responses
 */
export function asyncHandler(
  handler: (context: RequestContext) => Promise<void>
): (context: RequestContext) => Promise<void> {
  return async (context: RequestContext): Promise<void> => {
    try {
      await handler(context);
    } catch (error) {
      handleError(context.res, error);
    }
  };
}

/**
 * Express-style error middleware wrapper
 */
export function errorMiddleware(
  error: unknown,
  _req: unknown,
  res: ServerResponse,
  next: (error?: unknown) => void
): void {
  if (res.headersSent) {
    return next(error);
  }
  handleError(res, error);
}
