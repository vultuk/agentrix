import { HttpError } from './http-error.js';

/**
 * 404 Not Found
 */
export class NotFoundError extends HttpError {
  constructor(resource: string = 'Resource', cause: Error | null = null) {
    const message = typeof resource === 'string' && resource
      ? `${resource} not found`
      : 'Not found';
    super(message, 404, cause);
  }
}
