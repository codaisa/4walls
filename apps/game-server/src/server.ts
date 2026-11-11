import { Server } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@4walls/protocol';
import { AccountStore } from './accounts';
import { accountApi } from './api';
import { ArenaRoom } from './ArenaRoom';
import { staticWeb } from './static';

/**
 * Builds the game server (used by the entry point and by integration tests): the Colyseus rooms
 * plus the account / shop / ranking REST API on the same port.
 */
export function createServer({ dataFile = null as string | null, webDir = null as string | null } = {}) {
  const accounts = new AccountStore(dataFile);
  ArenaRoom.accounts = accounts;
  const server = new Server({
    transport: new WebSocketTransport(),
    express: (app) => {
      app.get('/healthz', (_req: unknown, res: { json: (v: unknown) => void }) => res.json({ ok: true, accounts: accounts.size }));
      app.use(accountApi(accounts));
      if (webDir) app.use(staticWeb(webDir));
    },
  });
  server.define(ROOM_NAME, ArenaRoom);
  return Object.assign(server, { accounts });
}
