import { describe, expect, it } from 'vitest';
import { createGame, detonate, step, tryPlaceBomb, useAbility } from '@4walls/core';
import { applySnapshot, encodeGrid, encodeSnapshot, parseInputBatch } from '../src';

const cfg = {
  mode: 'versus' as const,
  seed: 77,
  width: 15,
  height: 13,
  arenaId: 'caldeira' as const,
  players: [
    { id: 'p1', slot: 0, characterId: 'engenheiro', name: 'P1' },
    { id: 'p2', slot: 1, characterId: 'ninja', name: 'P2' },
  ],
};

describe('snapshot round-trip', () => {
  it('a client mirror rebuilt from snapshots matches the server state', () => {
    const server = createGame(cfg);
    const mirror = createGame(cfg);
    server.phase = 'playing';
    const p1 = server.players[0];
    p1.special = { kind: 'ice', charges: 3 };
    p1.canKick = true;
    useAbility(server, p1); // mine
    p1.x = 2;
    const b = tryPlaceBomb(server, p1)!;
    detonate(server, b);
    server.event = { type: 'meteors', phase: 'active', warnTick: 0, startTick: 0, endTick: 999 };
    server.meteors.push({ id: 999, x: 3, y: 3, spawnTick: 1, impactTick: 50 });
    step(server, {});

    const snap = JSON.parse(JSON.stringify(encodeSnapshot(server, { 0: 5 }, server.events)));
    applySnapshot(mirror, snap);

    expect(encodeGrid(mirror)).toBe(encodeGrid(server));
    const strip = (o: object) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'px' || k === 'py' ? undefined : v)));
    expect(strip(mirror.players)).toEqual(strip(server.players));
    expect(mirror.flames).toEqual(server.flames);
    expect(mirror.mines).toEqual(server.mines);
    expect(mirror.meteors).toEqual(server.meteors);
    expect(mirror.event).toEqual(server.event);
    expect(mirror.tick).toBe(server.tick);
  });

  it('input batches carry the ability button and reject garbage', () => {
    expect(parseInputBatch({ seq: 1, i: [[0, 3, 0, 1]] })?.inputs[0].input).toEqual({ move: 'right', bomb: false, ability: true, roll: false, jump: false });
    expect(parseInputBatch({ seq: 2, i: [[0, -1, 0, 0, 1, 1]] })?.inputs[0].input).toEqual({ move: null, bomb: false, ability: false, roll: true, jump: true });
    expect(parseInputBatch({ seq: 1, i: [[0, 9, 0, 1]] })).toBeNull();
    expect(parseInputBatch({ seq: 1, i: [[0, 1]] })).toBeNull();
  });
});
