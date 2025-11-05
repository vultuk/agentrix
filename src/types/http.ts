import type { IncomingMessage, ServerResponse } from 'node:http';
import type { URL } from 'node:url';

/**
 * HTTP request context passed to API handlers
 */
export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  method: string;
  workdir: string;
  params?: Record<string, string>;
  readJsonBody: () => Promise<Record<string, unknown>>;
}

/**
 * Generic API handler function type
 */
export type AsyncHandler<T = void> = (context: RequestContext) => Promise<T>;

/**
 * HTTP handler registry
 */
export interface RouteHandlers {
  GET?: AsyncHandler;
  POST?: AsyncHandler;
  PUT?: AsyncHandler;
  PATCH?: AsyncHandler;
  DELETE?: AsyncHandler;
  HEAD?: AsyncHandler;
  OPTIONS?: AsyncHandler;
}

/**
 * Route configuration
 */
export interface RouteConfig {
  requiresAuth: boolean;
  handlers: RouteHandlers;
}

/**
 * JSON response payload
 */
export type JsonResponse = Record<string, unknown> | { error: string } | { data: unknown };

