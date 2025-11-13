import type { IncomingMessage, ServerResponse } from 'node:http';
import { MAX_REQUEST_BODY_SIZE } from '../config/constants.js';

export interface JsonPayload {
  [key: string]: unknown;
}

export function sendJson(res: ServerResponse, statusCode: number, payload: JsonPayload | unknown): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

/**
 * Handles HEAD requests by sending a 200 response with no-store cache control
 * @param res - Server response object
 * @returns true if handled, false otherwise
 */
export function handleHeadRequest(res: ServerResponse): void {
  res.statusCode = 200;
  res.setHeader('Cache-Control', 'no-store');
  res.end();
}

/**
 * @deprecated Use extractErrorMessage from infrastructure/errors instead
 * Re-exported for backward compatibility
 */
export { extractErrorMessage } from '../infrastructure/errors/index.js';

export async function readJsonBody(req: IncomingMessage): Promise<JsonPayload> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0;

    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      length += chunk.length;

      if (length > MAX_REQUEST_BODY_SIZE) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        const buffer = Buffer.concat(chunks);
        resolve(JSON.parse(buffer.toString('utf8')) as JsonPayload);
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', (error: Error) => {
      reject(error);
    });
  });
}

/**
 * @deprecated Use infrastructure/cookies instead
 * This function re-exports for backward compatibility
 */
export { determineSecureCookie } from '../infrastructure/cookies/index.js';

export function getClientIp(req: IncomingMessage): string {
  const headerValue = req.headers?.['x-forwarded-for'];
  if (typeof headerValue === 'string' && headerValue.trim()) {
    const candidate = headerValue.split(',').map((part) => part.trim()).find(Boolean);
    if (candidate) {
      return candidate;
    }
  } else if (Array.isArray(headerValue) && headerValue.length) {
    const candidate = headerValue.map((part) => (part ? part.trim() : '')).find(Boolean);
    if (candidate) {
      return candidate;
    }
  }

  const remote = req.socket?.remoteAddress;
  if (typeof remote === 'string' && remote.trim()) {
    return remote;
  }

  return 'unknown';
}
