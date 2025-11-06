import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, it } from 'node:test';

import { MAX_REQUEST_BODY_SIZE } from '../config/constants.js';
import { handleHeadRequest, readJsonBody, sendJson } from './http.js';

type HeaderValue = string | number | string[];

class MockServerResponse extends EventEmitter {
  public statusCode = 0;
  public headers = new Map<string, HeaderValue>();
  public body = '';

  setHeader(name: string, value: string | number | readonly string[]): void {
    const key = name.toLowerCase();
    if (Array.isArray(value)) {
      this.headers.set(key, [...value]);
      return;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      this.headers.set(key, value);
      return;
    }
    this.headers.set(key, [...value]);
  }

  getHeader(name: string): HeaderValue | undefined {
    const value = this.headers.get(name.toLowerCase());
    if (Array.isArray(value)) {
      return [...value];
    }
    return value;
  }

  end(chunk?: string): void {
    if (chunk) {
      this.body += chunk;
    }
    this.emit('finish');
  }
}

class MockIncomingMessage extends EventEmitter {
  public destroyed = false;
  public headers: IncomingMessage['headers'];
  public socket: { encrypted?: boolean } | undefined;

  constructor(headers: IncomingMessage['headers'] = {}, socket: { encrypted?: boolean } | undefined = undefined) {
    super();
    this.headers = headers;
    this.socket = socket;
  }

  push(chunk: Buffer): void {
    this.emit('data', chunk);
  }

  finish(): void {
    this.emit('end');
  }

  destroy(): void {
    this.destroyed = true;
  }
}

describe('sendJson', () => {
  it('serialises payloads with headers', () => {
    const res = new MockServerResponse();
    const response = res as unknown as ServerResponse;

    sendJson(response, 201, { ok: true });

    assert.equal(res.statusCode, 201);
    assert.equal(res.getHeader('content-type'), 'application/json; charset=utf-8');
    assert.equal(res.getHeader('cache-control'), 'no-store');
    assert.equal(res.body, JSON.stringify({ ok: true }));
  });
});

describe('handleHeadRequest', () => {
  it('sets status and cache headers', () => {
    const res = new MockServerResponse();
    const response = res as unknown as ServerResponse;

    handleHeadRequest(response);

    assert.equal(res.statusCode, 200);
    assert.equal(res.getHeader('cache-control'), 'no-store');
    assert.equal(res.body, '');
  });
});

describe('readJsonBody', () => {
  it('parses JSON payloads', async () => {
    const req = new MockIncomingMessage();
    const request = req as unknown as IncomingMessage;
    const promise = readJsonBody(request);

    req.push(Buffer.from(JSON.stringify({ name: 'agentrix' }), 'utf8'));
    req.finish();

    const payload = await promise;
    assert.deepEqual(payload, { name: 'agentrix' });
  });

  it('resolves to empty object when no body is sent', async () => {
    const req = new MockIncomingMessage();
    const promise = readJsonBody(req as unknown as IncomingMessage);
    req.finish();
    const payload = await promise;
    assert.deepEqual(payload, {});
  });

  it('rejects when payload is invalid JSON', async () => {
    const req = new MockIncomingMessage();
    const promise = readJsonBody(req as unknown as IncomingMessage);

    req.push(Buffer.from('{invalid', 'utf8'));
    req.finish();

    await assert.rejects(promise, /Invalid JSON payload/);
  });

  it('rejects and destroys the request when payload exceeds size limit', async () => {
    const req = new MockIncomingMessage();
    const promise = readJsonBody(req as unknown as IncomingMessage);

    req.push(Buffer.alloc(MAX_REQUEST_BODY_SIZE + 1));
    req.finish();

    await assert.rejects(promise, /Request body too large/);
    assert.equal(req.destroyed, true);
  });
});

