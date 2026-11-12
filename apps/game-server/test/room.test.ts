import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { ROOM_NAME, isValidCode, type InputTuple, type LobbyInfo, type Snapshot, type StartInfo } from '@4walls/protocol';
import { createServer } from '../src/server';

const PORT = 25790;
const URL = `ws://localhost:${PORT}`;
let server: ReturnType<typeof createServer>;

beforeAll(async () => {
  server = createServer();
  await server.listen(PORT);
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

/** Records what a client receives so tests can wait on it. */
function track(room: Room) {
  const t = { room, lobby: null as LobbyInfo | null, start: null as StartInfo | null, snaps: [] as Snapshot[] };
  room.onMessage('lobby', (m: LobbyInfo) => (t.lobby = m));
  room.onMessage('start', (m: StartInfo) => (t.start = m));
  room.onMessage('snap', (m: Snapshot) => {
    t.snaps.push(m);
    if (t.snaps.length > 400) t.snaps.shift();
  });
  return t;
}
type Tracked = ReturnType<typeof track>;

async function waitFor<T>(fn: () => T | undefined | null | false, ms = 6000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 15));
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lastSnap = (t: Tracked) => t.snaps[t.snaps.length - 1];
const player = (snap: Snapshot, id: string) => snap.p.find((p) => p.id === id)!;

async function createRoom(): Promise<Tracked> {
  const t = track(await new Client(URL).create(ROOM_NAME, {}));
  await waitFor(() => t.lobby);
  return t;
}
async function joinRoom(code: string): Promise<Tracked> {
  const t = track(await new Client(URL).joinById(code));
  await waitFor(() => t.lobby);
  return t;
}

/** Sends `ticks` input batches at ~60 Hz for the given local slots. */
async function drive(t: Tracked, seqStart: number, ticks: number, tuples: (InputTuple | [number, number, number])[]) {
  for (let i = 0; i < ticks; i++) {
    t.room.send('input', { seq: seqStart + i, i: tuples });
    await sleep(16);
  }
  return seqStart + ticks;
}

describe('online rooms', () => {
  it('creates private rooms with unguessable codes', async () => {
    const a = await createRoom();
    const b = await createRoom();
    expect(isValidCode(a.lobby!.code)).toBe(true);
    expect(a.lobby!.code).not.toBe(b.lobby!.code);
    expect(a.lobby!.isPublic).toBe(false);
    await Promise.all([a.room.leave(), b.room.leave()]);
  });

  it('four players on four computers join the same room by code', async () => {
    const host = await createRoom();
    const code = host.lobby!.code;
    const others = await Promise.all([joinRoom(code), joinRoom(code), joinRoom(code)]);
    for (const t of [host, ...others]) t.room.send('join_slot', { localId: 'kb1' });
    const lobby = await waitFor(() => (host.lobby!.slots.length === 4 ? host.lobby : null));
    expect(new Set(lobby.slots.map((s) => s.owner)).size).toBe(4);
    expect(lobby.slots.map((s) => s.slot)).toEqual([0, 1, 2, 3]);
    expect(new Set(lobby.slots.map((s) => s.colorIndex)).size).toBe(4);
    await Promise.all([host, ...others].map((t) => t.room.leave()));
  });

  it('public matchmaking puts players in the same open room, never in private ones', async () => {
    const priv = await createRoom();
    const a = track(await new Client(URL).joinOrCreate(ROOM_NAME, { public: true }));
    const b = track(await new Client(URL).joinOrCreate(ROOM_NAME, { public: true }));
    await waitFor(() => a.lobby && b.lobby);
    expect(a.lobby!.isPublic).toBe(true);
    expect(b.lobby!.code).toBe(a.lobby!.code);
    expect(a.lobby!.code).not.toBe(priv.lobby!.code);
    await Promise.all([a.room.leave(), b.room.leave(), priv.room.leave()]);
  });

  it('players pick characters; the host picks the arena; the match uses both', async () => {
    const a = await createRoom();
    const b = await joinRoom(a.lobby!.code);
    a.room.send('join_slot', { localId: 'kb1' });
    b.room.send('join_slot', { localId: 'kb1' });
    await waitFor(() => a.lobby!.slots.length === 2);
    a.room.send('character', { slot: 0, step: 1 }); // bombito → ninja
    b.room.send('arena', { arena: 'floresta' }); // not host: ignored
    await sleep(150);
    expect(a.lobby!.arena).toBe('caldeira');
    a.room.send('arena', { arena: 'floresta' });
    a.room.send('arena', { arena: 'lua' }); // unknown: ignored
    await waitFor(() => a.lobby!.arena === 'floresta' && a.lobby!.slots[0].characterId === 'ninja');
    a.room.send('start', {});
    const start = await waitFor(() => b.start);
    expect(start.config.arenaId).toBe('floresta');
    expect(start.config.width).toBe(17);
    expect(start.config.players.find((p) => p.slot === 0)?.characterId).toBe('ninja');
    await Promise.all([a.room.leave(), b.room.leave()]);
  });

  it('rejects unknown room codes', async () => {
    await expect(new Client(URL).joinById('ZZZZZZ')).rejects.toBeTruthy();
  });

  it('two local players on one computer join as independent participants (hybrid)', async () => {
    const a = await createRoom();
    const b = await joinRoom(a.lobby!.code);
    a.room.send('join_slot', { localId: 'kb1' });
    a.room.send('join_slot', { localId: 'gp0' });
    b.room.send('join_slot', { localId: 'gp0' });
    const lobby = await waitFor(() => (a.lobby!.slots.length === 3 ? a.lobby : null));
    const owned = lobby.slots.filter((s) => s.owner === a.room.sessionId);
    expect(owned.map((s) => s.localId).sort()).toEqual(['gp0', 'kb1']);
    expect(lobby.slots.find((s) => s.owner === b.room.sessionId)?.slot).toBe(2);
    // Only the owner may change a slot.
    b.room.send('ready', { slot: 0, ready: true });
    await sleep(150);
    expect(a.lobby!.slots.find((s) => s.slot === 0)!.ready).toBe(false);
    await Promise.all([a.room.leave(), b.room.leave()]);
  });

  it('runs an authoritative match: inputs route to owned slots only, every client sees the same state', async () => {
    const a = await createRoom();
    const b = await joinRoom(a.lobby!.code);
    a.room.send('join_slot', { localId: 'kb1' }); // slot 0 → top-left
    a.room.send('join_slot', { localId: 'kb2' }); // slot 1 → bottom-right
    b.room.send('join_slot', { localId: 'gp0' }); // slot 2 → top-right
    await waitFor(() => a.lobby!.slots.length === 3);
    a.room.send('start', {});
    await waitFor(() => a.start && b.start);
    expect(a.start!.config.players).toHaveLength(3);
    await waitFor(() => lastSnap(a)?.ph === 'playing' && lastSnap(b)?.ph === 'playing', 6000);

    const before = lastSnap(a);
    // A drives its two players (right / left) and also tries to hijack B's slot 2 (down).
    const RIGHT = 3, LEFT = 2, DOWN = 1;
    let seq = await drive(a, 1, 30, [[0, RIGHT, 0], [1, LEFT, 0], [2, DOWN, 0]]);
    seq = await drive(a, seq, 10, [[0, -1, 0], [1, -1, 0]]);
    await sleep(150);
    const after = lastSnap(a);
    expect(player(after, 'p1').x).toBeGreaterThan(player(before, 'p1').x);
    expect(player(after, 'p2').x).toBeLessThan(player(before, 'p2').x);
    expect(player(after, 'p3').y).toBe(player(before, 'p3').y);
    expect(after.ack[0]).toBeGreaterThan(0);

    // Same tick ⇒ identical snapshot on both clients.
    const t = after.t;
    const snapB = await waitFor(() => b.snaps.find((s) => s.t === t));
    const snapA = a.snaps.find((s) => s.t === t)!;
    expect({ ...snapB, ev: [] }).toEqual({ ...snapA, ev: [] });

    // A bomb from slot 0 explodes identically for everyone.
    await drive(a, seq, 1, [[0, -1, 1]]);
    const boomA = await waitFor(() => a.snaps.flatMap((s) => s.ev).find((e) => e.type === 'explosion'), 5000);
    const boomB = await waitFor(() => b.snaps.flatMap((s) => s.ev).find((e) => e.type === 'explosion'), 5000);
    expect(boomB).toEqual(boomA);
    await Promise.all([a.room.leave(), b.room.leave()]);
  });

  it('a consented leave during a match knocks that connection’s players out', async () => {
    const a = await createRoom();
    const b = await joinRoom(a.lobby!.code);
    a.room.send('join_slot', { localId: 'kb1' });
    b.room.send('join_slot', { localId: 'gp0' });
    await waitFor(() => a.lobby!.slots.length === 2);
    a.room.send('start', {});
    await waitFor(() => lastSnap(a)?.ph === 'playing', 6000);
    await b.room.leave();
    const snap = await waitFor(() => a.snaps.find((s) => s.r));
    expect(snap.r).toMatchObject({ outcome: 'winner', winnerIds: ['p1'] });
    await a.room.leave();
  });

  it('a dropped connection keeps its seat and reconnects', async () => {
    const a = await createRoom();
    const b = await joinRoom(a.lobby!.code);
    b.room.reconnection.minUptime = 0;
    b.room.send('join_slot', { localId: 'kb1' });
    await waitFor(() => a.lobby!.slots.length === 1);
    let reconnected = false;
    b.room.onReconnect(() => (reconnected = true));
    // 4010 = CloseCode.MAY_TRY_RECONNECT: what the SDK sees on a recoverable network drop.
    b.room.connection.close(4010, 'simulated network drop');
    await waitFor(() => a.lobby!.slots[0]?.connected === false, 3000);
    await waitFor(() => reconnected && a.lobby!.slots[0]?.connected === true, 10000);
    expect(a.lobby!.slots[0].owner).toBe(b.room.sessionId);
    await Promise.all([a.room.leave(), b.room.leave()]);
  });

  it('a burst of inputs after a network hiccup is caught up quickly (no lasting input lag)', async () => {
    const a = await createRoom();
    const b = await joinRoom(a.lobby!.code);
    a.room.send('join_slot', { localId: 'kb1' });
    b.room.send('join_slot', { localId: 'kb1' });
    await waitFor(() => a.lobby!.slots.length === 2);
    a.room.send('start', {});
    await waitFor(() => lastSnap(a)?.ph === 'playing', 6000);
    // 8 inputs arrive at once (a phone network burst); the queue must drain well before 8 ticks.
    for (let i = 1; i <= 8; i++) a.room.send('input', { seq: i, i: [[0, -1, 0]] });
    const t0 = lastSnap(a).t;
    const caught = await waitFor(() => a.snaps.find((s) => s.ack[0] === 8));
    expect(caught.t - t0).toBeLessThanOrEqual(7);
    // Button presses are never lost while catching up.
    for (let i = 9; i <= 16; i++) a.room.send('input', { seq: i, i: [[0, -1, i === 9 ? 1 : 0]] });
    await waitFor(() => a.snaps.some((s) => s.ev.some((e) => e.type === 'bombPlaced')), 3000);
    await Promise.all([a.room.leave(), b.room.leave()]);
  });

  it('ignores malformed input payloads', async () => {
    const a = await createRoom();
    const b = await joinRoom(a.lobby!.code);
    a.room.send('join_slot', { localId: 'kb1' });
    b.room.send('join_slot', { localId: 'kb1' });
    await waitFor(() => a.lobby!.slots.length === 2);
    a.room.send('start', {});
    await waitFor(() => lastSnap(a)?.ph === 'playing', 6000);
    const before = player(lastSnap(a), 'p1');
    for (const bad of [null, 'x', { seq: -1, i: [] }, { seq: 1, i: [[0, 99, 0]] }, { seq: 2, i: [[7, 1, 0]] }, { seq: 3, i: 'nope' }]) {
      a.room.send('input', bad);
    }
    await sleep(300);
    expect([player(lastSnap(a), 'p1').x, player(lastSnap(a), 'p1').y]).toEqual([before.x, before.y]);
    await Promise.all([a.room.leave(), b.room.leave()]);
  });
});
