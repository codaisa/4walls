import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';

/** Production mode: one origin serves the page, the API and the websocket. */
describe('production web serving', () => {
  const PORT = 25792;
  const URL = `http://localhost:${PORT}`;
  let dir: string;
  let server: ReturnType<typeof createServer>;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), '4walls-web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>4Walls</title>');
    writeFileSync(join(dir, 'assets', 'app-Ab3_x9Zq.js'), 'console.log(1)');
    mkdirSync(join(dir, 'assets', 'blocks'));
    writeFileSync(join(dir, 'assets', 'blocks', 'crate.png'), 'png');
    writeFileSync(join(dir, '..', 'secret.txt'), 'nope');
    server = createServer({ webDir: dir });
    await server.listen(PORT);
  });
  afterAll(async () => {
    await server.gracefullyShutdown(false);
    rmSync(dir, { recursive: true, force: true });
    rmSync(join(dir, '..', 'secret.txt'), { force: true });
  });

  it('serves the page and long-caches hashed assets', async () => {
    const page = await fetch(`${URL}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(page.headers.get('cache-control')).toBe('no-cache');
    const js = await fetch(`${URL}/assets/app-Ab3_x9Zq.js`);
    expect(js.headers.get('content-type')).toContain('text/javascript');
    expect(js.headers.get('cache-control')).toContain('immutable');
  });

  it('art without a content hash is revalidated (304 when unchanged), never frozen for a year', async () => {
    const art = await fetch(`${URL}/assets/blocks/crate.png`);
    expect(art.headers.get('cache-control')).toBe('no-cache');
    const again = await fetch(`${URL}/assets/blocks/crate.png`, { headers: { 'If-Modified-Since': art.headers.get('last-modified')! } });
    expect(again.status).toBe(304);
  });

  it('client-side routes get the app shell; missing files 404', async () => {
    for (const route of ['/loja', '/online/room', '/config']) {
      const r = await fetch(`${URL}${route}`);
      expect(r.status).toBe(200);
      expect(await r.text()).toContain('<title>4Walls</title>');
    }
    expect((await fetch(`${URL}/assets/missing.js`)).status).toBe(404);
  });

  it('never serves files outside the web folder', async () => {
    const r = await fetch(`${URL}/..%2Fsecret.txt`);
    expect(await r.text()).not.toContain('nope');
  });

  it('API and health check live on the same origin', async () => {
    expect(await (await fetch(`${URL}/healthz`)).json()).toMatchObject({ ok: true });
    const created = await fetch(`${URL}/api/account`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    expect(created.status).toBe(201);
  });
});
