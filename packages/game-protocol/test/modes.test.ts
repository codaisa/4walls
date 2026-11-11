import { describe, expect, it } from 'vitest';
import { createGame, step, type GameState } from '@4walls/core';
import type { ModeId } from '@4walls/shared';
import { applySnapshot, encodeSnapshot, isOnlineMode, sanitizeName } from '../src';

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

  it('player names are trimmed, short and safe', () => {
    expect(sanitizeName('  Maria  ', 'P1')).toBe('Maria');
    expect(sanitizeName('<script>x', 'P1')).toBe('scriptx');
    expect(sanitizeName('', 'P2')).toBe('P2');
    expect(sanitizeName(42, 'P3')).toBe('P3');
    expect(sanitizeName('NomeMuitoComprido123', 'P1')).toHaveLength(12);
  });
});
