import { createReadStream, statSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.hdr': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json',
};

type Next = (err?: unknown) => void;

/** Vite output: a file straight under /assets with a content hash in its name. */
const HASHED = /^\/assets\/[^/]+-[\w-]{8}\.(js|css|woff2?|png|svg|webp)$/;

/**
 * Serves the built web client (apps/web/dist) from the game server, so production needs one
 * process and one origin: page, websocket and API share host and port (no CORS, no mixed content).
 * Hashed build files (/assets/name-HASH.js) are cached for a year; everything else (art under
 * /assets/<folder>, models, the page, the service worker) is revalidated with Last-Modified.
 * Unknown paths fall back to index.html (client-side routes like /loja or /online/room).
 */
export function staticWeb(dir: string) {
  const root = resolve(dir);
  return (req: IncomingMessage, res: ServerResponse, next: Next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (path.startsWith('/api/') || path.startsWith('/matchmake')) return next();
    let file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) return next(); // path traversal
    let stat = safeStat(file);
    if (!stat?.isFile()) {
      // Real missing assets 404; app routes get the SPA shell.
      if (extname(path)) return next();
      file = join(root, 'index.html');
      stat = safeStat(file);
      if (!stat) return next();
    }
    const modified = stat.mtime.toUTCString();
    res.setHeader('Cache-Control', HASHED.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
    res.setHeader('Last-Modified', modified);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const since = req.headers['if-modified-since'];
    if (since && Date.parse(since) >= Math.floor(stat.mtimeMs / 1000) * 1000) {
      res.statusCode = 304;
      return res.end();
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  };
}

function safeStat(file: string) {
  try {
    return statSync(file);
  } catch {
    return null;
  }
}
