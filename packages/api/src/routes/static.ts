import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { App } from './types.js';

const API_PREFIXES = ['/accounts', '/automations', '/runs', '/ingest', '/test', '/health'];

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

const isApiPath = (url: string): boolean =>
  API_PREFIXES.some(
    (prefix) => url === prefix || url.startsWith(`${prefix}/`) || url.startsWith(`${prefix}?`),
  );

const isFile = (file: string): boolean => existsSync(file) && statSync(file).isFile();

export const registerStatic = (app: App, publicDir: string): void => {
  const root = path.resolve(publicDir);
  app.setNotFoundHandler(async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? '/';
    if (request.method !== 'GET' || isApiPath(pathname) || !existsSync(root)) {
      return reply.status(404).send({ error: `Route ${request.method} ${pathname} not found` });
    }
    const requested = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    const file =
      requested.startsWith(root) && isFile(requested) ? requested : path.join(root, 'index.html');
    if (!isFile(file)) {
      return reply.status(404).send({ error: `Route ${request.method} ${pathname} not found` });
    }
    const type = CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream';
    return reply.type(type).send(createReadStream(file));
  });
};
