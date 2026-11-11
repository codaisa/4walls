import { Cell, RULES, secToTicks } from '@4walls/shared';
import { describe, expect, it } from 'vitest';
import { createGame, detonate, getCell, setCell, step, tryPlaceBomb, flameAt, hitPlayer } from '../src';
import { input, makeGame, placeAt, run } from './helpers';

const FUSE = secToTicks(RULES.fuseSec);

describe('movement & collision', () => {
  it('does not walk through border walls', () => {
    const s = makeGame();
    run(s, 60, { p1: input({ move: 'up' }) });
    run(s, 60, { p1: input({ move: 'left' }) });
    expect(s.players[0].x).toBe(1);
    expect(s.players[0].y).toBe(1);
  });

  it('does not walk through pillars', () => {
    const s = makeGame();
    placeAt(s, 'p1', 1, 2);
    run(s, 60, { p1: input({ move: 'right' }) });
    expect(s.players[0].x).toBe(1);
  });

  it('moves along open corridors at its speed', () => {
    const s = makeGame();
    run(s, 30, { p1: input({ move: 'right' }) });
    expect(s.players[0].x).toBeCloseTo(1 + RULES.baseSpeed * 0.5, 5);
    expect(s.players[0].y).toBe(1);
  });

  it('slides around corners (corner assist)', () => {
    const s = makeGame();
    placeAt(s, 'p1', 2.8, 1);
    run(s, 20, { p1: input({ move: 'down' }) });
    expect(s.players[0].x).toBe(3);
    expect(s.players[0].y).toBeGreaterThan(1);
  });

  it('blocks on destructible blocks', () => {
    const s = makeGame();
    setCell(s.grid, 3, 1, Cell.Block);
    run(s, 60, { p1: input({ move: 'right' }) });
    expect(s.players[0].x).toBe(2);
  });
});

describe('bomb placement', () => {
  it('rejects a second bomb on an occupied cell', () => {
    const s = makeGame();
    s.players[0].maxBombs = 3;
    expect(tryPlaceBomb(s, s.players[0])).not.toBeNull();
    expect(tryPlaceBomb(s, s.players[0])).toBeNull();
    expect(s.bombs).toHaveLength(1);
  });

  it('respects the simultaneous bomb limit', () => {
    const s = makeGame();
    tryPlaceBomb(s, s.players[0]);
    placeAt(s, 'p1', 3, 1);
    expect(tryPlaceBomb(s, s.players[0])).toBeNull();
  });

  it('lets the owner walk off a fresh bomb but not back onto it', () => {
    const s = makeGame();
    step(s, { p1: input({ bomb: true }) });
    run(s, 30, { p1: input({ move: 'right' }) });
    const x = s.players[0].x;
    expect(x).toBeGreaterThan(2);
    run(s, 40, { p1: input({ move: 'left' }) });
    expect(s.players[0].x).toBe(2);
  });
});

describe('explosions', () => {
  it('detonates after the fuse in a cross shape stopped by walls', () => {
    const s = makeGame();
    placeAt(s, 'p2', 11, 9);
    const b = tryPlaceBomb(s, s.players[0])!;
    placeAt(s, 'p1', 5, 1); // out of range
    run(s, FUSE - 1);
    expect(s.bombs).toContain(b);
    step(s, {});
    expect(s.bombs).not.toContain(b);
    for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 2], [1, 3]]) expect(flameAt(s, x, y), `${x},${y}`).toBeTruthy();
    expect(flameAt(s, 0, 1)).toBeFalsy();
    expect(flameAt(s, 4, 1)).toBeFalsy();
  });

  it('indestructible walls stop the blast', () => {
    const s = makeGame();
    s.players[0].range = 4;
    placeAt(s, 'p1', 2, 1);
    const b = tryPlaceBomb(s, s.players[0])!;
    placeAt(s, 'p1', 7, 1);
    detonate(s, b);
    expect(flameAt(s, 2, 2)).toBeFalsy(); // pillar
    expect(flameAt(s, 2, 3)).toBeFalsy();
    expect(getCell(s.grid, 2, 2)).toBe(Cell.Wall);
  });

  it('destroys a destructible block and stops there', () => {
    const s = makeGame();
    s.players[0].range = 5;
    setCell(s.grid, 3, 1, Cell.Block);
    const b = tryPlaceBomb(s, s.players[0])!;
    placeAt(s, 'p1', 1, 5);
    detonate(s, b);
    expect(getCell(s.grid, 3, 1)).toBe(Cell.Floor);
    expect(flameAt(s, 3, 1)).toBeTruthy();
    expect(flameAt(s, 4, 1)).toBeFalsy();
    expect(s.events.some((e) => e.type === 'blockDestroyed')).toBe(true);
  });

  it('chains into other bombs in the same tick', () => {
    const s = makeGame();
    s.players[0].maxBombs = 2;
    const a = tryPlaceBomb(s, s.players[0])!;
    placeAt(s, 'p1', 3, 1);
    const b = tryPlaceBomb(s, s.players[0])!;
    placeAt(s, 'p1', 7, 1);
    detonate(s, a);
    expect(s.bombs).toHaveLength(0);
    expect(s.events.filter((e) => e.type === 'explosion').map((e) => (e as { bombId: number }).bombId)).toEqual([a.id, b.id]);
    expect(flameAt(s, 5, 1)).toBeTruthy(); // reached by the chained bomb
  });

  it('burns power-ups that were already on the floor', () => {
    const s = makeGame();
    s.powerups.push({ id: 999, type: 'fireUp', x: 2, y: 1, bornTick: -1 });
    const b = tryPlaceBomb(s, s.players[0])!;
    placeAt(s, 'p1', 1, 5);
    detonate(s, b);
    expect(s.powerups.find((p) => p.id === 999)).toBeUndefined();
  });
});

describe('damage', () => {
  it('kills a player caught in the blast and declares the survivor winner', () => {
    const s = makeGame();
    tryPlaceBomb(s, s.players[0]);
    run(s, FUSE + 1);
    expect(s.players[0].alive).toBe(false);
    expect(s.phase).toBe('ended');
    expect(s.result).toMatchObject({ outcome: 'winner', winnerIds: ['p2'] });
  });

  it('a shield absorbs exactly one hit, once per explosion', () => {
    const s = makeGame();
    s.players[0].shield = 1;
    tryPlaceBomb(s, s.players[0]);
    let shieldBreaks = 0;
    for (let i = 0; i < FUSE + secToTicks(RULES.flameSec) + 5; i++) {
      step(s, {});
      shieldBreaks += s.events.filter((e) => e.type === 'shieldBroken').length;
    }
    expect(shieldBreaks).toBe(1);
    expect(s.players[0].alive).toBe(true);
    expect(s.players[0].shield).toBe(0);
  });

  it('hits are ignored while invulnerable and death happens once', () => {
    const s = makeGame();
    const p = s.players[0];
    hitPlayer(s, p, null);
    hitPlayer(s, p, null);
    expect(s.events.filter((e) => e.type === 'playerDied')).toHaveLength(1);
  });
});

describe('power-ups', () => {
  it('apply their effect when collected', () => {
    const s = makeGame();
    s.powerups.push({ id: 900, type: 'bombUp', x: 2, y: 1, bornTick: 0 }, { id: 901, type: 'fireUp', x: 3, y: 1, bornTick: 0 });
    s.powerups.push({ id: 902, type: 'speedUp', x: 4, y: 1, bornTick: 0 }, { id: 903, type: 'shield', x: 5, y: 1, bornTick: 0 });
    run(s, 90, { p1: input({ move: 'right' }) });
    const p = s.players[0];
    expect(p.maxBombs).toBe(RULES.baseBombs + 1);
    expect(p.range).toBe(RULES.baseRange + 1);
    expect(p.speed).toBeCloseTo(RULES.baseSpeed + RULES.speedStep);
    expect(p.shield).toBe(1);
    expect(s.powerups).toHaveLength(0);
  });
});

describe('modes & determinism', () => {
  it('solo: victory when every enemy is down', () => {
    const s = makeGame({ mode: 'solo', players: 1, enemies: 2 });
    for (const e of s.enemies) e.alive = false;
    step(s, {});
    expect(s.result).toMatchObject({ outcome: 'victory', reason: 'allEnemiesDown' });
  });

  it('solo: enemies hurt on contact', () => {
    const s = makeGame({ mode: 'solo', players: 1, enemies: 1 });
    const e = s.enemies[0];
    e.x = e.tx = 1;
    e.y = e.ty = 1;
    step(s, {});
    expect(s.result).toMatchObject({ outcome: 'defeat' });
  });

  it('the same seed generates the same arena', () => {
    const cfg = { mode: 'solo' as const, seed: 42, width: 15, height: 13, players: [{ id: 'a', slot: 0, characterId: 'bombito', name: 'A' }] };
    expect(Array.from(createGame(cfg).grid.cells)).toEqual(Array.from(createGame(cfg).grid.cells));
  });

  it('spawn pockets are always free', () => {
    for (let seed = 1; seed < 30; seed++) {
      const s = createGame({ mode: 'versus', seed, width: 15, height: 13, players: [] });
      for (const [x, y] of [[1, 1], [2, 1], [1, 2], [13, 11], [12, 11], [13, 10]]) expect(getCell(s.grid, x, y)).toBe(Cell.Floor);
    }
  });
});
