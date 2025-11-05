import { sendJson } from '../utils/http.js';
import { asyncHandler } from '../infrastructure/errors/index.js';
import type { RequestContext } from '../types/http.js';

/**
 * Generic handler function type
 */
export type HandlerFunction<TInput = unknown, TOutput = unknown> = (
  input: TInput,
  context: RequestContext
) => Promise<TOutput>;

/**
 * Validation function type
 */
export type ValidationFunction<TInput = unknown> = (payload: unknown) => TInput;

/**
 * Options for creating a handler
 */
export interface HandlerOptions<TInput, TOutput> {
  /**
   * The service method to call
   */
  handler: HandlerFunction<TInput, TOutput>;
  
  /**
   * Optional validation function for request body
   */
  validator?: ValidationFunction<TInput>;
  
  /**
   * HTTP status code for successful response (default: 200)
   */
  successCode?: number;
  
  /**
   * Whether to read JSON body from request (default: true if validator is provided)
   */
  readBody?: boolean;
  
  /**
   * Custom response transformer (default: wraps result in { data: result })
   */
  responseTransformer?: (result: TOutput) => unknown;
}

/**
 * Creates a standardized API handler with validation and error handling
 * 
 * @example
 * ```typescript
 * const createUser = createHandler({
 *   handler: async (input, context) => userService.create(input),
 *   validator: validateUserCreate,
 *   successCode: 201
 * });
 * ```
 */
export function createHandler<TInput = void, TOutput = unknown>(
  options: HandlerOptions<TInput, TOutput>
): (context: RequestContext) => Promise<void> {
  const {
    handler,
    validator,
    successCode = 200,
    readBody = Boolean(validator),
    responseTransformer,
  } = options;

  return asyncHandler(async (context: RequestContext) => {
    let input: TInput;

    if (readBody) {
      const payload = await context.readJsonBody();
      input = validator ? validator(payload) : (payload as TInput);
    } else {
      input = undefined as TInput;
    }

    const result = await handler(input, context);
    
    const response = responseTransformer 
      ? responseTransformer(result)
      : result;

    sendJson(context.res, successCode, response);
  });
}

/**
 * Creates a simple handler that doesn't require input validation
 */
export function createSimpleHandler<TOutput = unknown>(
  handler: (context: RequestContext) => Promise<TOutput>,
  options: { successCode?: number; responseTransformer?: (result: TOutput) => unknown } = {}
): (context: RequestContext) => Promise<void> {
  return createHandler({
    handler: async (_input: void, context: RequestContext) => handler(context),
    readBody: false,
    ...options,
  });
}

/**
 * Creates a handler for query parameter-based requests
 */
export function createQueryHandler<TOutput = unknown>(
  handler: (context: RequestContext) => Promise<TOutput>,
  options: { successCode?: number; responseTransformer?: (result: TOutput) => unknown } = {}
): (context: RequestContext) => Promise<void> {
  return asyncHandler(async (context: RequestContext) => {
    const result = await handler(context);
    const response = options.responseTransformer 
      ? options.responseTransformer(result)
      : result;
    sendJson(context.res, options.successCode || 200, response);
  });
}

