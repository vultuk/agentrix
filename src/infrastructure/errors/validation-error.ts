import { HttpError } from './http-error.js';

/**
 * 400 Bad Request - Invalid input
 */
export class ValidationError extends HttpError {
  constructor(message: string, cause: Error | null = null) {
    super(message, 400, cause);
  }
}

/**
 * 401 Unauthorized
 */
export class UnauthorizedError extends HttpError {
  constructor(message: string = 'Authentication required', cause: Error | null = null) {
    super(message, 401, cause);
  }
}

/**
 * 405 Method Not Allowed
 */
export class MethodNotAllowedError extends HttpError {
  public readonly allowedMethods: string[];

  constructor(allowedMethods: string[] = [], cause: Error | null = null) {
    const message = allowedMethods.length > 0
      ? `Method not allowed. Allowed methods: ${allowedMethods.join(', ')}`
      : 'Method not allowed';
    super(message, 405, cause);
    this.allowedMethods = allowedMethods;
  }
}
