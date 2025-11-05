/**
 * Base HTTP error class with status code support
 */
export class HttpError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 500, cause: Error | null = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    if (cause) {
      this.cause = cause;
    }
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): { error: string; status: number } {
    return {
      error: this.message,
      status: this.statusCode,
    };
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalServerError extends HttpError {
  constructor(message: string = 'Internal server error', cause: Error | null = null) {
    super(message, 500, cause);
  }
}

/**
 * 503 Service Unavailable
 */
export class ServiceUnavailableError extends HttpError {
  constructor(message: string = 'Service unavailable', cause: Error | null = null) {
    super(message, 503, cause);
  }
}

/**
 * 502 Bad Gateway (for external service failures)
 */
export class BadGatewayError extends HttpError {
  constructor(message: string = 'Bad gateway', cause: Error | null = null) {
    super(message, 502, cause);
  }
}
