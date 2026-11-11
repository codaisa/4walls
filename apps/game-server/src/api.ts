import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RankingBoard } from '@4walls/shared';
import type { AccountStore } from './accounts';

const MAX_BODY = 4096;
/** Account creations per IP per minute (guest accounts are free; this stops scripted spam). */
const CREATE_PER_MIN = 10;

type Next = (err?: unknown) => void;

/**
 * REST API for accounts, shop and ranking, mounted on the game server's HTTP server:
 *   POST  /api/account          → new guest account { credential, account }
 *   GET   /api/me               → the account (Authorization: Bearer <id.token>)
 *   PATCH /api/me               → { name?, characterId?, colorIndex?, loadout? }
 *   POST  /api/shop/buy         → { itemId }
 *   GET   /api/ranking?board=xp|wins|season
 */
export function accountApi(store: AccountStore) {
  const creates = new Map<string, { at: number; n: number }>();

  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (!url.pathname.startsWith('/api/')) return next();
    // The web client is served from another origin (Vite dev server / CDN).
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    if (req.method === 'OPTIONS') return send(res, 204, null);

    try {
      const route = `${req.method} ${url.pathname}`;
      if (route === 'GET /api/ranking') {
        const board = (['xp', 'wins', 'season'] as RankingBoard[]).find((b) => b === url.searchParams.get('board')) ?? 'xp';
        const me = store.auth(bearer(req));
        return send(res, 200, store.ranking(board, Number(url.searchParams.get('limit')) || 50, me?.id));
      }
      if (route === 'POST /api/account') {
        const ip = req.socket.remoteAddress ?? '?';
        const now = Date.now();
        const c = creates.get(ip);
        const n = c && now - c.at < 60_000 ? c.n + 1 : 1;
        creates.set(ip, { at: n === 1 ? now : c!.at, n });
        if (n > CREATE_PER_MIN) return send(res, 429, { error: 'Muitas contas criadas. Tente de novo em instantes.' });
        return send(res, 201, store.create((await body(req)) as object));
      }

      const acc = store.auth(bearer(req));
      if (!acc) return send(res, 401, { error: 'Conta não encontrada.' });
      if (route === 'GET /api/me') return send(res, 200, { account: store.view(acc) });
      if (route === 'PATCH /api/me') return send(res, 200, { account: store.updateProfile(acc, (await body(req)) as object) });
      if (route === 'POST /api/shop/buy') {
        const r = store.buy(acc, ((await body(req)) as { itemId?: unknown }).itemId);
        return r.ok ? send(res, 200, { account: r.account }) : send(res, 400, { error: r.error });
      }
      return send(res, 404, { error: 'Rota desconhecida.' });
    } catch (err) {
      return send(res, err instanceof BadRequest ? 400 : 500, { error: err instanceof BadRequest ? err.message : 'Erro no servidor.' });
    }
  };
}

class BadRequest extends Error {}

function bearer(req: IncomingMessage) {
  const h = req.headers.authorization ?? '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  if (data === null) return res.end();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}

async function body(req: IncomingMessage): Promise<unknown> {
  // A body parser upstream (express.json) may already have consumed the stream.
  const parsed = (req as IncomingMessage & { body?: unknown }).body;
  if (parsed && typeof parsed === 'object' && !Buffer.isBuffer(parsed)) return parsed;
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new BadRequest('Corpo grande demais.');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error();
    return v;
  } catch {
    throw new BadRequest('JSON inválido.');
  }
}
