import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const MIME_TYPES = new Map([
  ['.apng', 'image/apng'],
  ['.avif', 'image/avif'],
  ['.css', 'text/css'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'application/javascript'],
  ['.json', 'application/json'],
  ['.map', 'application/json'],
  ['.mjs', 'application/javascript'],
  ['.otf', 'font/otf'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
  ['.webm', 'video/webm'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml'],
  ['.zip', 'application/zip'],
]);

function fallbackLookup(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES.get(ext) || null;
}

let lookupMimeType = fallbackLookup;

try {
  const mime = require('mime-types');
  if (mime && typeof mime.lookup === 'function') {
    lookupMimeType = (filePath) => mime.lookup(filePath) || fallbackLookup(filePath);
  }
} catch (error) {
  if (error?.code !== 'MODULE_NOT_FOUND' && error?.code !== 'ERR_MODULE_NOT_FOUND') {
    console.error('[terminal-worktree] Failed to load optional dependency "mime-types":', error);
  } else {
    console.warn('[terminal-worktree] Optional dependency "mime-types" not found; using built-in MIME map.');
  }
}

function applyContentType(res, filePath) {
  const type = lookupMimeType(filePath) || 'application/octet-stream';
  const isText = type.startsWith('text/') && !type.includes('charset');
  const value = isText ? `${type}; charset=utf-8` : type;
  res.setHeader('Content-Type', value);
  return type;
}

function setCacheControl(res, contentType) {
  if (contentType === 'text/html') {
    res.setHeader('Cache-Control', 'no-store');
  } else if (contentType.startsWith('text/')) {
    res.setHeader('Cache-Control', 'public, max-age=60');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function serveFile(res, filePath, method) {
  const contentType = applyContentType(res, filePath);
  setCacheControl(res, contentType);

  if (method === 'HEAD') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const content = await fs.readFile(filePath);
  res.statusCode = 200;
  res.end(content);
}

async function createFileProvider(resolvedPath) {
  const contents = await fs.readFile(resolvedPath, 'utf8');

  async function serve(req, res) {
    const method = req.method?.toUpperCase() || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.end('Method Not Allowed');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 200;
    if (method === 'HEAD') {
      res.end();
      return;
    }
    res.end(contents);
  }

  return {
    type: 'file',
    resolvedPath,
    serve,
  };
}

async function createDirectoryProvider(resolvedPath) {
  const indexPath = path.join(resolvedPath, 'index.html');
  const indexHtml = await fs.readFile(indexPath, 'utf8');

  async function serve(req, res) {
    const method = req.method?.toUpperCase() || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.end('Method Not Allowed');
      return;
    }

    const url = new URL(req.url || '/', 'http://localhost');
    const decodedPath = decodeURIComponent(url.pathname);
    if (!decodedPath || decodedPath === '/' || decodedPath === '') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 200;
      if (method === 'HEAD') {
        res.end();
        return;
      }
      res.end(indexHtml);
      return;
    }

    const requestPath = decodedPath.replace(/^\/+/, '');
    let targetPath = path.join(resolvedPath, requestPath);
    const normalised = path.resolve(targetPath);

    if (!isPathInside(resolvedPath, normalised)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    try {
      const stats = await fs.stat(normalised);
      if (stats.isDirectory()) {
        targetPath = path.join(normalised, 'index.html');
        await fs.access(targetPath);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.statusCode = 200;
        if (method === 'HEAD') {
          res.end();
          return;
        }
        const html = await fs.readFile(targetPath, 'utf8');
        res.end(html);
        return;
      }

      await serveFile(res, normalised, method);
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        console.error('[terminal-worktree] Failed to serve UI asset:', error);
        res.statusCode = 500;
        res.end('Internal Server Error');
        return;
      }

      if (path.extname(requestPath)) {
        res.statusCode = 404;
        res.end('Not Found');
        return;
      }

      // SPA fallback to index.html
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 200;
      if (method === 'HEAD') {
        res.end();
        return;
      }
      res.end(indexHtml);
    }
  }

  return {
    type: 'directory',
    resolvedPath,
    serve,
  };
}

export async function createUiProvider(uiPath) {
  const resolvedPath = path.resolve(uiPath);
  let stats;
  try {
    stats = await fs.stat(resolvedPath);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      throw new Error(`UI path not found at ${resolvedPath}`);
    }
    throw error;
  }

  if (stats.isDirectory()) {
    return createDirectoryProvider(resolvedPath);
  }

  if (stats.isFile()) {
    return createFileProvider(resolvedPath);
  }

  throw new Error(`UI path must be a file or directory: ${resolvedPath}`);
}
