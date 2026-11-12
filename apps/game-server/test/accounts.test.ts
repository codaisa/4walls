import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@colyseus/sdk';
import { matchMaker } from 'colyseus';
import { ROOM_NAME, type LobbyInfo } from '@4walls/protocol';
import { COSMETICS, levelInfo, matchReward, type MatchPerformance, type RewardReport } from '@4walls/shared';
import { AccountStore } from '../src/accounts';
import { createServer } from '../src/server';

const perf = (p: Partial<MatchPerformance> = {}): MatchPerformance => ({
  mode: 'versus',
  outcome: 'win',
  players: 2,
  kills: 1,
  enemies: 0,
  died: false,
  blocks: 10,
  powerups: 2,
  bosses: [],
  bossRushClear: false,
  seconds: 90,
  ...p,
});

describe('account store', () => {
  it('creates guest accounts and only accepts the right credential', () => {
    const store = new AccountStore(null);
    const { credential, account } = store.create({ name: 'Faísca', characterId: 'ninja', colorIndex: 3 });
    expect(account).toMatchObject({ name: 'Faísca', characterId: 'ninja', colorIndex: 3, xp: 0, coins: 300 });
    expect(account).not.toHaveProperty('tokenHash');
    expect(store.auth(credential)?.id).toBe(account.id);
    expect(store.auth(`${account.id}.wrong`)).toBeNull();
    expect(store.auth('nope')).toBeNull();
    expect(store.auth(42)).toBeNull();
  });

  it('rescued heroes join the collection once; only owned heroes can be picked', () => {
    const store = new AccountStore(null);
    const { credential, account } = store.create({ characterId: 'senha' });
    expect(account.characterId).toBe('bombito'); // not rescued yet
    expect(account.characters).toEqual([]);
    const acc = store.auth(credential)!;
    expect(store.unlockCharacter(acc, 'senha')).toBe(true);
    expect(store.unlockCharacter(acc, 'senha')).toBe(false);
    expect(store.unlockCharacter(acc, 'ninja')).toBe(false); // starters are always there
    expect(store.unlockCharacter(acc, 'nobody')).toBe(false);
    expect(store.updateProfile(acc, { characterId: 'senha' }).characterId).toBe('senha');
    expect(store.view(acc).characters).toEqual(['senha']);
  });

  it('a match grants XP, coins, stats and history; level-ups and achievements pay extra', () => {
    const store = new AccountStore(null);
    const { credential } = store.create();
    const acc = store.auth(credential)!;
    const r = store.recordMatch(acc, perf(), 0);
    expect(r.reward).toEqual(matchReward(perf()));
    expect(r.account.xp).toBe(r.reward.xp);
    expect(r.newAchievements).toContain('first_win');
    expect(r.levelAfter).toBe(levelInfo(r.reward.xp).level);
    expect(r.account.coins).toBe(300 + r.reward.coins + r.bonusCoins);
    expect(r.account.stats).toMatchObject({ matches: 1, wins: 1, kills: 1, blocks: 10, powerups: 2, winStreak: 1 });
    expect(r.account.history[0]).toMatchObject({ mode: 'versus', outcome: 'win', xp: r.reward.xp });
    // The same achievement never pays twice.
    expect(store.recordMatch(acc, perf(), 0).newAchievements).not.toContain('first_win');
  });

  it('beating a boss unlocks its cosmetic; a loss resets the win streak', () => {
    const store = new AccountStore(null);
    const acc = store.auth(store.create().credential)!;
    const r = store.recordMatch(acc, perf({ mode: 'bossrush', outcome: 'loss', bosses: ['golem'] }), 0);
    expect(r.newAchievements).toEqual(['golem_slayer']);
    expect(r.newItems).toContain('hat_chifres');
    expect(r.account.stats.winStreak).toBe(0);
    expect(r.account.stats.bossKills.golem).toBe(1);
  });

  it('the shop sells items for coins; the loadout only accepts owned items in the right slot', () => {
    const store = new AccountStore(null);
    const acc = store.auth(store.create().credential)!;
    expect(store.buy(acc, 'hat_coroa')).toEqual({ ok: false, error: 'Moedas insuficientes.' });
    expect(store.buy(acc, 'hat_chifres')).toMatchObject({ ok: false }); // not for sale
    const bought = store.buy(acc, 'hat_bone');
    expect(bought).toMatchObject({ ok: true });
    expect(acc.coins).toBe(300 - COSMETICS.hat_bone.price);
    expect(store.buy(acc, 'hat_bone')).toEqual({ ok: false, error: 'Você já tem este item.' });
    const v = store.updateProfile(acc, { name: '  Pavio<>  ', loadout: { hat: 'hat_bone', bomb: 'bomb_ouro', fire: 'hat_bone', title: 'title_novato' } });
    expect(v.name).toBe('Pavio');
    expect(v.loadout).toEqual({ hat: 'hat_bone', bomb: null, fire: null, title: 'title_novato' });
  });

  it('ranks players by XP, wins and season XP', () => {
    const store = new AccountStore(null);
    const a = store.auth(store.create({ name: 'A' }).credential)!;
    const b = store.auth(store.create({ name: 'B' }).credential)!;
    store.create({ name: 'Never played' });
    store.recordMatch(a, perf({ outcome: 'loss', kills: 5 }), 0);
    store.recordMatch(b, perf(), 0);
    const xp = store.ranking('xp', 10, a.id);
    expect(xp.entries.map((e) => e.name)).toEqual([a.xp > b.xp ? 'A' : 'B', a.xp > b.xp ? 'B' : 'A']);
    expect(xp.me?.name).toBe('A');
    expect(store.ranking('wins').entries[0].name).toBe('B');
    expect(store.ranking('season').entries).toHaveLength(2);
  });

  it('persists to disk and reloads', () => {
    const dir = mkdtempSync(join(tmpdir(), '4walls-'));
    try {
      const file = join(dir, 'accounts.json');
      const s1 = new AccountStore(file);
      const { credential } = s1.create({ name: 'Brasa' });
      s1.recordMatch(s1.auth(credential)!, perf(), 0);
      s1.flush();
      const s2 = new AccountStore(file);
      const acc = s2.auth(credential)!;
      expect(acc.name).toBe('Brasa');
      expect(acc.stats.matches).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('account API + match rewards', () => {
  const PORT = 25791;
  const HTTP = `http://localhost:${PORT}`;
  let server: ReturnType<typeof createServer>;
  beforeAll(async () => {
    server = createServer();
    await server.listen(PORT);
  });
  afterAll(async () => {
    await server.gracefullyShutdown(false);
  });

  const api = async (path: string, init: RequestInit & { auth?: string } = {}) => {
    const res = await fetch(`${HTTP}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.auth ? { Authorization: `Bearer ${init.auth}` } : {}) },
    });
    return { status: res.status, body: (await res.json().catch(() => null)) as any };
  };

  it('creates, reads, updates an account, buys an item and reads the ranking', async () => {
    const created = await api('/api/account', { method: 'POST', body: JSON.stringify({ name: 'Rojão' }) });
    expect(created.status).toBe(201);
    const auth = created.body.credential as string;
    expect((await api('/api/me')).status).toBe(401);
    expect((await api('/api/me', { auth })).body.account.name).toBe('Rojão');
    const buy = await api('/api/shop/buy', { method: 'POST', auth, body: JSON.stringify({ itemId: 'title_pavio' }) });
    expect(buy.body.account.owned).toContain('title_pavio');
    const patch = await api('/api/me', { method: 'PATCH', auth, body: JSON.stringify({ loadout: { title: 'title_pavio' } }) });
    expect(patch.body.account.loadout.title).toBe('title_pavio');
    expect((await api('/api/me', { method: 'PATCH', auth, body: '{bad' })).status).toBe(400);
    const ranking = await api('/api/ranking?board=wins', { auth });
    expect(ranking.status).toBe(200);
    expect(Array.isArray(ranking.body.entries)).toBe(true);
  });

  it('rescuing a caged hero online unlocks it on the account and pushes the account to that device', async () => {
    const { body } = await api('/api/account', { method: 'POST', body: JSON.stringify({ name: 'Resgate' }) });
    const auth = body.credential as string;
    const client = new Client(`ws://localhost:${PORT}`);
    const a = await client.create(ROOM_NAME, {});
    let lobby: LobbyInfo | null = null;
    let pushed: { characters: string[] } | null = null;
    a.onMessage('lobby', (m: LobbyInfo) => (lobby = m));
    a.onMessage('account', (m: { characters: string[] }) => (pushed = m));
    for (const t of ['start', 'snap', 'rewards']) a.onMessage(t, () => {});
    a.send('join_slot', { localId: 'kb1', auth, characterId: 'senha' });
    await waitFor(() => (lobby as LobbyInfo | null)?.slots.length === 1);
    expect(lobby!.slots[0].characterId).toBe('bombito'); // not rescued yet: no Senha
    a.send('mode', { mode: 'adventure' });
    await waitFor(() => (lobby as LobbyInfo | null)?.mode === 'adventure');
    a.send('start', {});
    // Reach into the authoritative room: blow the first cage open and stand on it.
    const room = matchMaker.getLocalRoomById(a.roomId) as unknown as { game: import('@4walls/core').GameState | null };
    const g = await waitFor(() => room.game?.phase === 'playing' && room.game);
    const p = g.players[0];
    // Rescue cage after cage until the draw gives a non-starter hero (the draw is random).
    let hero = 'bombito';
    const cage = g.adventure!.cages[0];
    g.grid.cells[(cage.y - g.grid.y0) * g.grid.w + (cage.x - g.grid.x0)] = 0;
    await sleep(80);
    p.x = p.px = cage.x;
    p.y = p.py = cage.y;
    // The draw is random: free the same prisoner again until a non-starter hero shows up.
    for (let tries = 0; tries < 30; tries++) {
      hero = await waitFor(() => (cage.state === 'rescued' ? p.characterId : null));
      if (!['bombito', 'ninja', 'engenheiro'].includes(hero)) break;
      cage.state = 'free';
    }
    expect(['bombito', 'ninja', 'engenheiro']).not.toContain(hero);
    const acc = await waitFor(() => (pushed as { characters: string[] } | null)?.characters.includes(hero) && pushed);
    expect(acc).toBeTruthy();
    expect((await api('/api/me', { auth })).body.account.characters).toContain(hero);
    await a.leave(true);
  });

  it('the winner of an online match gets XP and the reward report; guests get nothing', async () => {
    const { body } = await api('/api/account', { method: 'POST', body: JSON.stringify({ name: 'Vencedor' }) });
    const auth = body.credential as string;
    const client = new Client(`ws://localhost:${PORT}`);
    const a = await client.create(ROOM_NAME, {});
    const b = await client.joinById(a.roomId);
    let lobby: LobbyInfo | null = null;
    let report: RewardReport | null = null;
    let guestReport: RewardReport | null = null;
    a.onMessage('lobby', (m: LobbyInfo) => (lobby = m));
    a.onMessage('rewards', (m: RewardReport) => (report = m));
    b.onMessage('rewards', (m: RewardReport) => (guestReport = m));
    b.onMessage('lobby', () => {});
    a.onMessage('start', () => {});
    b.onMessage('start', () => {});
    a.onMessage('snap', () => {});
    b.onMessage('snap', () => {});
    a.send('join_slot', { localId: 'kb1', auth });
    b.send('join_slot', { localId: 'kb1' });
    await waitFor(() => (lobby as LobbyInfo | null)?.slots.length === 2);
    const mine = lobby!.slots.find((s) => s.owner === a.sessionId)!;
    expect(mine.level).toBe(1);
    expect(mine.loadout?.title).toBe('title_novato');
    a.send('start', {});
    await sleep(300);
    await b.leave(true); // the rival leaves: last one standing wins
    const r = await waitFor(() => report as RewardReport | null);
    expect(r.reward.xp).toBeGreaterThan(0);
    expect(r.account.stats.wins).toBe(1);
    expect(r.newAchievements).toContain('first_win');
    expect(guestReport).toBeNull();
    await a.leave(true);
  });
});

async function waitFor<T>(fn: () => T | undefined | null | false, ms = 8000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('waitFor timed out');
    await sleep(15);
  }
}
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
