import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { App } from './types.js';

const API_PREFIXES = ['/accounts', '/automations', '/runs', '/ingest', '/test', '/health'];

const NEVER_HTML_PREFIXES = ['/ingest', '/test', '/health'];

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const underPrefix = (url: string, prefixes: string[]): boolean =>
  prefixes.some(
    (prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`),
  );

const prefersHtml = (accept: string | undefined): boolean => {
  if (accept === undefined) {
    return false;
  }
  const html = accept.indexOf('text/html');
  const json = accept.indexOf('application/json');
  return html !== -1 && (json === -1 || html < json);
};

const isFile = (file: string): boolean => existsSync(file) && statSync(file).isFile();

export const registerStatic = (app: App, publicDir: string): void => {
  const root = path.resolve(publicDir);
  const index = path.join(root, 'index.html');
  app.addHook('onRequest', async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? '/';
    if (
      request.method !== 'GET' ||
      !prefersHtml(request.headers.accept) ||
      underPrefix(pathname, NEVER_HTML_PREFIXES) ||
      !isFile(index)
    ) {
      return;
    }
    return reply.type(CONTENT_TYPES['.html'] ?? 'text/html').send(createReadStream(index));
  });
  app.setNotFoundHandler(async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? '/';
    if (request.method !== 'GET' || underPrefix(pathname, API_PREFIXES) || !existsSync(root)) {
      return reply.status(404).send({ error: `Route ${request.method} ${pathname} not found` });
    }
    const requested = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    const file = requested.startsWith(root) && isFile(requested) ? requested : index;
    if (!isFile(file)) {
      return reply.status(404).send({ error: `Route ${request.method} ${pathname} not found` });
    }
    const type = CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream';
    return reply.type(type).send(createReadStream(file));
  });
};
