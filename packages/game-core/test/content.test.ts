import { ARENAS, Cell, CHARACTERS, RULES, secToTicks } from '@4walls/shared';
import { describe, expect, it } from 'vitest';
import { createGame, detonate, flamesAt, getCell, setCell, step, tryPlaceBomb, useAbility, type GameState } from '../src';
import { input, makeGame, placeAt, run } from './helpers';

const FUSE = secToTicks(RULES.fuseSec);
const p = (s: GameState, i = 0) => s.players[i];

describe('characters & abilities', () => {
  it('characters differ in stats', () => {
    const s = makeGame({ players: 3, characters: ['bombito', 'ninja', 'engenheiro'] });
    expect(p(s, 1).speed).toBeCloseTo(RULES.baseSpeed + CHARACTERS.ninja.speedBonus);
    expect(p(s, 2).speed).toBeLessThan(p(s, 0).speed);
  });

  it('bomb-up is capped per character (Ninja carries fewer bombs)', () => {
    const s = makeGame({ characters: ['ninja'] });
    for (let i = 0; i < 10; i++) s.powerups.push({ id: 100 + i, type: 'bombUp', x: 1, y: 1, bornTick: 0 }), step(s, {});
    expect(p(s).maxBombs).toBe(CHARACTERS.ninja.maxBombs);
  });

  it('Bombito mini-bomb ignores the bomb limit, then goes on cooldown', () => {
    const s = makeGame();
    tryPlaceBomb(s, p(s));
    placeAt(s, 'p1', 3, 1);
    expect(tryPlaceBomb(s, p(s))).toBeNull(); // limit reached
    useAbility(s, p(s));
    expect(s.bombs).toHaveLength(2);
    expect(s.bombs[1]).toMatchObject({ range: 1, extra: true });
    placeAt(s, 'p1', 5, 1);
    useAbility(s, p(s));
    expect(s.bombs).toHaveLength(2); // cooldown
  });

  it('Ninja dash moves up to 3 cells and stops at obstacles', () => {
    const s = makeGame({ characters: ['ninja'] });
    p(s).facing = 'right';
    useAbility(s, p(s));
    expect(p(s).x).toBeCloseTo(4);
    setCell(s.grid, 6, 1, Cell.Block);
    p(s).abilityReadyTick = 0;
    useAbility(s, p(s));
    expect(p(s).x).toBeCloseTo(5);
    // Blocked right away → no ability event and no cooldown spent.
    p(s).facing = 'right';
    p(s).abilityReadyTick = 0;
    s.events = [];
    useAbility(s, p(s));
    expect(s.events.filter((e) => e.type === 'abilityUsed')).toHaveLength(0);
    expect(p(s).abilityReadyTick).toBe(0);
  });

  it('Engenheiro mine arms, then explodes when an opponent steps on it', () => {
    const s = makeGame({ characters: ['engenheiro'] });
    placeAt(s, 'p1', 3, 1);
    useAbility(s, p(s));
    expect(s.mines).toHaveLength(1);
    placeAt(s, 'p1', 7, 1);
    run(s, secToTicks(RULES.mineArmSec) + 1);
    placeAt(s, 'p2', 3, 1);
    step(s, {});
    expect(s.mines).toHaveLength(0);
    expect(p(s, 1).alive).toBe(false);
    expect(p(s, 0).kills).toBe(1);
  });

  it('the owner can walk over their own mine safely', () => {
    const s = makeGame({ characters: ['engenheiro'] });
    useAbility(s, p(s));
    run(s, secToTicks(RULES.mineArmSec) + 5);
    expect(s.mines).toHaveLength(1);
    expect(p(s).alive).toBe(true);
  });
});

describe('power-ups', () => {
  it('kick sends a bomb sliding until it hits something', () => {
    const s = makeGame();
    p(s).canKick = true;
    placeAt(s, 'p1', 3, 1);
    const b = tryPlaceBomb(s, p(s))!;
    placeAt(s, 'p1', 1, 1);
    p(s).passBombs = [];
    run(s, 30, { p1: input({ move: 'right' }) });
    expect(b.x).toBeGreaterThan(4);
    expect(b.slideDir).toBe('right');
    run(s, 60);
    expect(b.x).toBe(11); // stopped against the border wall, still unexploded
    expect(b.slideDir).toBeNull();
    expect(getCell(s.grid, 12, 1)).toBe(Cell.Wall);
  });

  it('boots walk through bombs', () => {
    const s = makeGame();
    placeAt(s, 'p1', 3, 1);
    tryPlaceBomb(s, p(s));
    placeAt(s, 'p1', 1, 1);
    p(s).passBombs = [];
    p(s).hasBoots = true;
    run(s, 50, { p1: input({ move: 'right' }) });
    expect(p(s).x).toBeGreaterThan(3);
  });

  it('ghost walks through destructible blocks while active', () => {
    const s = makeGame();
    setCell(s.grid, 3, 1, Cell.Block);
    s.powerups.push({ id: 900, type: 'ghost', x: 1, y: 1, bornTick: 0 });
    run(s, 40, { p1: input({ move: 'right' }) });
    expect(p(s).x).toBeGreaterThan(3);
  });

  it('remote bombs wait for the ability button', () => {
    const s = makeGame();
    p(s).hasRemote = true;
    const b = tryPlaceBomb(s, p(s))!;
    expect(b.remote).toBe(true);
    placeAt(s, 'p1', 1, 5);
    run(s, FUSE + 10);
    expect(s.bombs).toContain(b);
    step(s, { p1: input({ ability: true }) });
    expect(s.bombs).not.toContain(b);
  });

  it('infernal bombs leave fire that keeps killing', () => {
    const s = makeGame();
    p(s).special = { kind: 'fire', charges: 3 };
    const b = tryPlaceBomb(s, p(s))!;
    expect(b.kind).toBe('fire');
    expect(p(s).special?.charges).toBe(2);
    placeAt(s, 'p1', 1, 5);
    detonate(s, b);
    run(s, secToTicks(1.5)); // normal flames would be gone by now
    expect(flamesAt(s, 2, 1).length).toBeGreaterThan(0);
    placeAt(s, 'p2', 2, 1);
    step(s, {});
    expect(p(s, 1).alive).toBe(false);
  });

  it('ice bombs freeze instead of killing; frozen players cannot act', () => {
    const s = makeGame();
    p(s).special = { kind: 'ice', charges: 1 };
    placeAt(s, 'p2', 2, 1);
    const b = tryPlaceBomb(s, p(s))!;
    expect(p(s).special).toBeNull();
    detonate(s, b);
    step(s, {});
    expect(p(s, 1).alive).toBe(true);
    expect(p(s, 1).frozenUntil).toBeGreaterThan(s.tick);
    const x = p(s, 1).x;
    run(s, 20, { p2: input({ move: 'right', bomb: true }) });
    expect(p(s, 1).x).toBe(x);
    expect(s.bombs.filter((bb) => bb.ownerId === 'p2')).toHaveLength(0);
  });

  it('ice freezes enemies (harmless while frozen)', () => {
    const s = makeGame({ mode: 'solo', players: 1, enemies: 1 });
    const e = s.enemies[0];
    e.x = e.tx = 2;
    e.y = e.ty = 1;
    p(s).special = { kind: 'ice', charges: 1 };
    placeAt(s, 'p1', 3, 1);
    detonate(s, tryPlaceBomb(s, p(s))!);
    step(s, {});
    expect(e.alive).toBe(true);
    expect(e.frozenUntil).toBeGreaterThan(s.tick);
    placeAt(s, 'p1', 2, 1);
    run(s, 5);
    expect(p(s).alive).toBe(true);
  });
});

describe('arena events', () => {
  it('announces an event, activates it, then ends and schedules the next one', () => {
    const s = makeGame({ events: true });
    s.nextEventTick = s.tick + 1;
    run(s, 2);
    expect(s.event?.phase).toBe('warning');
    run(s, secToTicks(RULES.eventWarnSec));
    expect(s.event?.phase).toBe('active');
    run(s, secToTicks(RULES.eventDurationSec) + 1);
    expect(s.event).toBeNull();
    expect(s.nextEventTick).toBeGreaterThan(s.tick);
  });

  it('meteors are telegraphed, then blast their cell', () => {
    const s = makeGame({ events: true });
    s.event = { type: 'meteors', phase: 'active', warnTick: 0, startTick: s.tick, endTick: s.tick + 600 };
    run(s, secToTicks(RULES.meteorEverySec) + 1);
    expect(s.meteors.length).toBeGreaterThan(0);
    const m = s.meteors[0];
    placeAt(s, 'p2', m.x, m.y);
    run(s, secToTicks(RULES.meteorFallSec) + 1);
    expect(s.events.length >= 0 && p(s, 1).alive).toBe(false);
  });

  it('ice floor keeps players sliding until they hit something', () => {
    const s = makeGame({ events: true });
    s.event = { type: 'iceFloor', phase: 'active', warnTick: 0, startTick: 0, endTick: s.tick + 600 };
    step(s, { p1: input({ move: 'right' }) });
    run(s, 160); // no input at all
    expect(p(s).x).toBe(11); // slid along the top corridor to the far wall
  });
});

describe('arenas', () => {
  it('each arena sets its own grid size', () => {
    const s = createGame({ mode: 'versus', seed: 3, width: 0, height: 0, arenaId: 'floresta', players: [] });
    expect([s.grid.w, s.grid.h]).toEqual([ARENAS.floresta.width, ARENAS.floresta.height]);
  });
});
