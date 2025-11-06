import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, before, after } from 'node:test';

import { createUiProvider } from './ui.js';

interface TestResponse {
  statusCode: number;
  headers: Map<string, string>;
  getBody(): Buffer;
  setHeader(name: string, value: string): void;
  end(data?: string | Buffer): void;
}

function createResponse(): TestResponse {
  const headers = new Map<string, string>();
  let body: Buffer = Buffer.alloc(0);
  return {
    statusCode: 0,
    headers,
    getBody() {
      return body;
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
    end(data?: string | Buffer) {
      if (typeof data === 'string') {
        body = Buffer.from(data, 'utf8');
      } else if (data) {
        body = Buffer.from(data);
      }
    },
  };
}

describe('createUiProvider', () => {
  let tmpDir: string;
  let filePath: string;

  before(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentrix-ui-test-'));
    const indexHtml = '<!doctype html><html><body><h1>Agentrix</h1></body></html>';
    const nestedDir = path.join(tmpDir, 'assets');
    await fs.mkdir(nestedDir);
    await fs.writeFile(path.join(tmpDir, 'index.html'), indexHtml, 'utf8');
    await fs.writeFile(path.join(nestedDir, 'app.js'), 'console.log("hello");', 'utf8');
    await fs.writeFile(path.join(tmpDir, 'style.css'), 'body { color: black; }', 'utf8');

    filePath = path.join(tmpDir, 'standalone.html');
    await fs.writeFile(filePath, '<p>Standalone</p>', 'utf8');
  });

  after(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('throws when UI path missing', async () => {
    await assert.rejects(() => createUiProvider(path.join(tmpDir, 'missing')), {
      message: /UI path not found/,
    });
  });

  it('serves index and static assets from directory', async () => {
    const provider = await createUiProvider(tmpDir);
    assert.equal(provider.type, 'directory');

    const indexRes = createResponse();
    await provider.serve(
      { url: '/', method: 'GET' } as unknown as { url: string; method: string },
      indexRes as unknown as Parameters<typeof provider.serve>[1],
    );
    assert.equal(indexRes.statusCode, 200);
    assert.equal(indexRes.headers.get('Content-Type'), 'text/html; charset=utf-8');
    assert.ok(indexRes.getBody().toString('utf8').includes('<h1>Agentrix</h1>'));

    const assetRes = createResponse();
    await provider.serve(
      { url: '/style.css', method: 'GET' } as unknown as { url: string; method: string },
      assetRes as unknown as Parameters<typeof provider.serve>[1],
    );
    assert.equal(assetRes.statusCode, 200);
    assert.equal(assetRes.headers.get('Content-Type'), 'text/css; charset=utf-8');
    assert.ok(assetRes.getBody().toString('utf8').includes('color: black'));
  });

  it('prevents path traversal and returns 404 for missing assets', async () => {
    const provider = await createUiProvider(tmpDir);

    const forbiddenRes = createResponse();
    await provider.serve(
      { url: '/%2e%2e%5csecret.txt', method: 'GET' } as unknown as { url: string; method: string },
      forbiddenRes as unknown as Parameters<typeof provider.serve>[1],
    );
    assert.equal(forbiddenRes.statusCode, 403);

    const missingRes = createResponse();
    await provider.serve(
      { url: '/missing.js', method: 'GET' } as unknown as { url: string; method: string },
      missingRes as unknown as Parameters<typeof provider.serve>[1],
    );
    assert.equal(missingRes.statusCode, 404);
  });

  it('falls back to index.html for SPA routes', async () => {
    const provider = await createUiProvider(tmpDir);

    const res = createResponse();
    await provider.serve(
      { url: '/dashboard/view', method: 'GET' } as unknown as { url: string; method: string },
      res as unknown as Parameters<typeof provider.serve>[1],
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers.get('Content-Type'), 'text/html; charset=utf-8');
    assert.ok(res.getBody().toString('utf8').includes('<h1>Agentrix</h1>'));
  });

  it('serves static HTML file directly', async () => {
    const provider = await createUiProvider(filePath);
    assert.equal(provider.type, 'file');

    const res = createResponse();
    await provider.serve(
      { url: '/', method: 'GET' } as unknown as { url: string; method: string },
      res as unknown as Parameters<typeof provider.serve>[1],
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers.get('Content-Type'), 'text/html; charset=utf-8');
    assert.ok(res.getBody().toString('utf8').includes('Standalone'));
  });
});
