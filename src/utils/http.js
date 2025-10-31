import { MAX_REQUEST_BODY_SIZE } from '../config/constants.js';

export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;

    req.on('data', (chunk) => {
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
        resolve(JSON.parse(buffer.toString('utf8')));
      } catch (error) {
        reject(new Error('Invalid JSON payload'));
      }
    });

    req.on('error', (error) => {
      reject(error);
    });
  });
}

export function determineSecureCookie({ configValue, request }) {
  const normalized = typeof configValue === 'string' ? configValue.trim().toLowerCase() : configValue;
  if (normalized === 'true' || normalized === true) {
    return true;
  }
  if (normalized === 'false' || normalized === false) {
    return false;
  }

  if (!request || typeof request !== 'object') {
    return false;
  }

  const encrypted = Boolean(request.socket && request.socket.encrypted);
  if (encrypted) {
    return true;
  }

  const forwardedProto = request.headers?.['x-forwarded-proto'];
  if (typeof forwardedProto === 'string') {
    return forwardedProto.split(',').map((value) => value.trim().toLowerCase()).includes('https');
  }

  return false;
}
