import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT } from '@4walls/protocol';
import { createServer } from './server';

const port = Number(process.env.PORT ?? DEFAULT_PORT);
/** Accounts live in one JSON file (override with DATA_FILE). */
const dataFile = process.env.DATA_FILE ?? fileURLToPath(new URL('../data/accounts.json', import.meta.url));
/** Production: the built web client is served from here too (WEB_DIR, default apps/web/dist if built). */
const builtWeb = fileURLToPath(new URL('../../web/dist', import.meta.url));
const webDir = process.env.WEB_DIR ?? ((process.env.NODE_ENV === 'production' || process.argv.includes('--prod')) && existsSync(builtWeb) ? builtWeb : null);
const server = createServer({ dataFile, webDir });
await server.listen(port);
console.log(`[4walls] game server listening on :${port} · ${server.accounts.size} accounts (${dataFile})${webDir ? ` · serving web from ${webDir}` : ''}`);

const stop = () => {
  server.accounts.flush();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
