/**
 * Centralized API client with unified error handling
 */

export interface FetchOptions extends RequestInit {
  /**
   * Whether to include credentials (default: true)
   */
  credentials?: RequestCredentials;
  
  /**
   * Custom error message prefix (default: 'Request failed')
   */
  errorPrefix?: string;
}

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly statusText: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Authentication error - thrown when status is 401
 */
export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'Unauthorized');
    this.name = 'AuthenticationError';
  }
}

/**
 * Extract error message from response
 */
async function extractErrorFromResponse(
  response: Response,
  fallbackMessage: string
): Promise<string> {
  try {
    const data = await response.json();
    if (data?.error && typeof data.error === 'string') {
      return data.error;
    }
  } catch {
    // Ignore JSON parse errors
  }
  return fallbackMessage;
}

/**
 * Makes an HTTP request with unified error handling
 * 
 * @throws {AuthenticationError} When status is 401
 * @throws {ApiError} When request fails
 */
export async function apiRequest<T = unknown>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const {
    credentials = 'include',
    errorPrefix = 'Request failed',
    ...fetchOptions
  } = options;

  const response = await fetch(url, {
    ...fetchOptions,
    credentials,
  });

  // Handle authentication errors
  if (response.status === 401) {
    throw new AuthenticationError();
  }

  // Handle other errors
  if (!response.ok) {
    const message = await extractErrorFromResponse(
      response,
      `${errorPrefix}: ${response.status}`
    );
    throw new ApiError(message, response.status, response.statusText);
  }

  return await response.json() as T;
}

/**
 * Makes a GET request
 */
export async function apiGet<T = unknown>(
  url: string,
  options: Omit<FetchOptions, 'method' | 'body'> = {}
): Promise<T> {
  return apiRequest<T>(url, { ...options, method: 'GET' });
}

/**
 * Makes a POST request
 */
export async function apiPost<T = unknown>(
  url: string,
  body?: unknown,
  options: Omit<FetchOptions, 'method' | 'body'> = {}
): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiPatch<T = unknown>(
  url: string,
  body?: unknown,
  options: Omit<FetchOptions, 'method' | 'body'> = {}
): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiDelete<T = unknown>(
  url: string,
  body?: unknown,
  options: Omit<FetchOptions, 'method' | 'body'> = {}
): Promise<T> {
  return apiRequest<T>(url, {
    ...options,
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Makes a HEAD request
 */
export async function apiHead(
  url: string,
  options: Omit<FetchOptions, 'method' | 'body'> = {}
): Promise<void> {
  const response = await fetch(url, {
    ...options,
    method: 'HEAD',
    credentials: options.credentials ?? 'include',
  });

  if (response.status === 401) {
    throw new AuthenticationError();
  }

  if (!response.ok) {
    throw new ApiError(
      `HEAD request failed: ${response.status}`,
      response.status,
      response.statusText
    );
  }
}

/**
 * Type guard to check if error is an AuthenticationError
 */
export function isAuthenticationError(error: unknown): error is AuthenticationError {
  return error instanceof AuthenticationError;
}

/**
 * Type guard to check if error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
