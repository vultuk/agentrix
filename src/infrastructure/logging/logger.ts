/**
 * Logger interface for dependency injection
 */
export interface Logger {
  info(...args: unknown[]): void;
  error(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

/**
 * Creates a logger instance that wraps the provided logger or falls back to console
 * @param providedLogger - Optional logger implementation
 * @returns Logger instance
 */
export function createLogger(providedLogger?: Partial<Logger>): Logger {
  return {
    info: (...args: unknown[]): void => {
      if (providedLogger && typeof providedLogger.info === 'function') {
        providedLogger.info(...args);
      } else {
        console.info(...args);
      }
    },
    error: (...args: unknown[]): void => {
      if (providedLogger && typeof providedLogger.error === 'function') {
        providedLogger.error(...args);
      } else {
        console.error(...args);
      }
    },
    warn: (...args: unknown[]): void => {
      if (providedLogger && typeof providedLogger.warn === 'function') {
        providedLogger.warn(...args);
      } else {
        console.warn(...args);
      }
    },
    debug: (...args: unknown[]): void => {
      if (providedLogger && typeof providedLogger.debug === 'function') {
        providedLogger.debug(...args);
      } else {
        console.debug(...args);
      }
    },
  };
}

/**
 * Creates a console logger (default implementation)
 * @returns Logger instance using console
 */
export function createConsoleLogger(): Logger {
  return createLogger();
}

