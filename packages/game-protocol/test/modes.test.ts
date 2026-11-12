import { describe, expect, it } from 'vitest';
import { createGame, spawnBoss, step, type GameState } from '@4walls/core';
import type { ModeId } from '@4walls/shared';
import { applySnapshot, encodeInput, encodeSnapshot, isOnlineMode, parseInputBatch, sanitizeName } from '../src';
import { CAMP_ACTIONS, campActionIndex } from '@4walls/shared';

const cfg = (mode: ModeId) => ({
  mode,
  seed: 4242,
  width: 15,
  height: 13,
  arenaId: 'caldeira' as const,
  events: false,
  players: [{ id: 'p1', slot: 0, characterId: 'bombito', name: 'Ana' }],
});

/** Server + client mirror built the way the online room does (same config → same world). */
function pair(mode: ModeId) {
  const server = createGame(cfg(mode));
  const mirror = createGame(cfg(mode));
  for (let i = 0; i < server.countdownTicks + 2; i++) step(server, {});
  return { server, mirror };
}

const sync = (server: GameState, mirror: GameState) => applySnapshot(mirror, JSON.parse(JSON.stringify(encodeSnapshot(server, {}, []))));

describe('every mode online', () => {
  it('accepts all four modes', () => {
    for (const m of ['versus', 'solo', 'adventure', 'bossrush']) expect(isOnlineMode(m)).toBe(true);
    expect(isOnlineMode('battle')).toBe(false);
  });

  it('adventure: the mirror rebuilds the same world and follows regions and gates', () => {
    const { server, mirror } = pair('adventure');
    expect(mirror.grid.w).toBe(server.grid.w);
    expect(Array.from(mirror.adventure!.regionOf)).toEqual(Array.from(server.adventure!.regionOf));
    // Clear the first region on the server: its gate opens and the next region unlocks.
    for (const e of server.enemies) if (e.regionId === 0) e.alive = false;
    step(server, {});
    sync(server, mirror);
    expect(mirror.adventure!.regions[0].cleared).toBe(true);
    expect(mirror.adventure!.regions[1].unlocked).toBe(true);
    expect(mirror.adventure!.gates[0].open).toBe(true);
    expect(mirror.adventure!.gates[0].openedTick).toBe(server.adventure!.gates[0].openedTick);
  });

  it('adventure (Task 3): a resumed expedition and a fall back to camp reach the mirror', () => {
    const save = { camp: 5, coins: 60, snapshot: [], returns: 0, camps: 1, best: 6 };
    const server = createGame({ ...cfg('adventure'), expedition: save });
    const mirror = createGame({ ...cfg('adventure'), expedition: save });
    for (let i = 0; i < server.countdownTicks + 2; i++) step(server, {});
    expect(mirror.adventure!.windowKey).toBe(server.adventure!.windowKey);
    // Light the fire and walk on, then the group falls.
    const fire = server.adventure!.props.find((p) => p.kind === 'campfire')!;
    server.players[0].x = server.players[0].px = fire.x - 2;
    server.players[0].y = server.players[0].py = fire.y;
    step(server, {});
    sync(server, mirror);
    expect(mirror.adventure!.props.find((p) => p.kind === 'campfire')!.state).toBe('lit');
    server.players[0].alive = false;
    for (let i = 0; i < 60 * 3; i++) step(server, {});
    expect(server.expedition).toMatchObject({ returns: 1, coins: 30 });
    sync(server, mirror);
    expect(mirror.expedition).toMatchObject({ returns: 1, coins: 30, camp: 5 });
    expect(mirror.adventure!.windowKey).toBe(server.adventure!.windowKey);
    expect(Array.from(mirror.grid.cells)).toEqual(Array.from(server.grid.cells));
    expect(mirror.adventure!.props.find((p) => p.kind === 'campfire')!.state).toBe(server.adventure!.props.find((p) => p.kind === 'campfire')!.state);
  });

  it('boss rush: the mirror tracks the boss state, health and queue', () => {
    const { server, mirror } = pair('bossrush');
    server.boss!.hp = 9;
    server.boss!.enraged = true;
    for (let i = 0; i < 30; i++) step(server, {});
    sync(server, mirror);
    expect(mirror.boss).toMatchObject({ kind: 'golem', hp: 9, enraged: true, action: server.boss!.action });
    expect(mirror.boss!.x).toBeCloseTo(server.boss!.x, 2);
    expect(mirror.bossQueue).toEqual(server.bossQueue);
    server.boss = null;
    server.bossesDefeated = 1;
    sync(server, mirror);
    expect(mirror.boss).toBeNull();
    expect(mirror.bossesDefeated).toBe(1);
  });

  it('adventure: a chamber boss travels to the mirror with its chamber, level and phase', () => {
    const { server, mirror } = pair('adventure');
    spawnBoss(server, 'golem', { x: 7, y: 7, regionId: 0, level: 1, hp: 20, speedMul: 1.06 });
    for (let i = 0; i < 10; i++) step(server, {});
    sync(server, mirror);
    expect(mirror.boss).toMatchObject({ kind: 'golem', regionId: 0, level: 1, maxHp: 20, phase: 0 });
    server.boss = null;
    sync(server, mirror);
    expect(mirror.boss).toBeNull();
  });

  it('player names are trimmed, short and safe', () => {
    expect(sanitizeName('  Maria  ', 'P1')).toBe('Maria');
    expect(sanitizeName('<script>x', 'P1')).toBe('scriptx');
    expect(sanitizeName('', 'P2')).toBe('P2');
    expect(sanitizeName(42, 'P3')).toBe('P3');
    expect(sanitizeName('NomeMuitoComprido123', 'P1')).toHaveLength(12);
  });

  it('camp commands travel in the input tuple; out-of-range actions are dropped', () => {
    const idx = campActionIndex('shop:bombUp');
    const t = encodeInput(0, { move: null, bomb: false, ability: false, campBank: true, campAction: idx });
    expect(parseInputBatch({ seq: 1, i: [t] })!.inputs[0].input).toMatchObject({ campBank: true, campAction: idx });
    expect(parseInputBatch({ seq: 1, i: [[0, -1, 0, 0, 0, 0, 0, 0, CAMP_ACTIONS.length + 5]] })!.inputs[0].input.campAction).toBeUndefined();
  });
});
