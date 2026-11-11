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

/**
 * Serves the built web client (apps/web/dist) from the game server, so production needs one
 * process and one origin: page, websocket and API share host and port (no CORS, no mixed content).
 * Hashed files under /assets are cached for a year; everything else is revalidated.
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
    res.statusCode = 200;
    res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
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
