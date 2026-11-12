import { describe, expect, it } from 'vitest';
import { BOSSES, Cell, secToTicks, type GameConfig } from '@4walls/shared';
import { createGame, getCell, rootLines, setCell, slamCells, step, type GameState } from '../src';

const config = (players = 1): GameConfig => ({
  mode: 'bossrush',
  seed: 1234,
  width: 0,
  height: 0,
  players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, slot: i, characterId: 'bombito', name: `P${i + 1}` })),
  // The classic machine (the reworked bosses have their own tests).
  classicBosses: true,
});

function run(s: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) step(s, {});
}

/** Skips the countdown. */
function start(players = 1) {
  const s = createGame(config(players));
  run(s, s.countdownTicks + 1);
  expect(s.phase).toBe('playing');
  return s;
}

/** A player-owned flame right on the boss body. */
function burnBoss(s: GameState, ownerId = 'p1', kind: 'normal' | 'ice' = 'normal') {
  const b = s.boss!;
  s.flames.push({ x: Math.round(b.x), y: Math.round(b.y), part: 'center', dir: null, bombId: 999, ownerId, bornTick: s.tick, untilTick: s.tick + 30, kind });
}

describe('boss rush', () => {
  it('builds an open boss arena with the golem in the middle and stronger heroes', () => {
    const s = createGame(config(2));
    expect(s.boss?.kind).toBe('golem');
    expect(s.boss?.hp).toBe(BOSSES.golem.hp);
    const { x, y } = s.boss!;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect(getCell(s.grid, x + dx, y + dy)).toBe(Cell.Floor);
    expect(s.players[0].maxBombs).toBe(2);
    expect(s.players[0].range).toBe(3);
    expect(s.enemies).toHaveLength(0);
  });

  it('takes one hit per blast (hit cooldown) and ignores its own fire', () => {
    const s = start();
    s.boss!.nextAttackTick = 1e9; // keep it calm
    burnBoss(s);
    run(s, 1);
    expect(s.boss!.hp).toBe(BOSSES.golem.hp - 1);
    run(s, 5); // the same flame keeps burning but the cooldown blocks it
    expect(s.boss!.hp).toBe(BOSSES.golem.hp - 1);
    run(s, secToTicks(BOSSES.golem.hitCooldownSec) + 1);
    burnBoss(s, 'boss');
    run(s, 1);
    expect(s.boss!.hp).toBe(BOSSES.golem.hp - 1);
  });

  it('ice freezes the boss instead of hurting it', () => {
    const s = start();
    s.boss!.nextAttackTick = 1e9;
    burnBoss(s, 'p1', 'ice');
    run(s, 1);
    expect(s.boss!.hp).toBe(BOSSES.golem.hp);
    expect(s.boss!.frozenUntil).toBeGreaterThan(s.tick);
  });

  it('enrages below half health and wins the round when it falls', () => {
    // A rush with the Golem alone: its fall ends the match.
    const s = createGame({ ...config(1), bosses: ['golem'] });
    run(s, s.countdownTicks + 1);
    const b = s.boss!;
    b.nextAttackTick = 1e9;
    b.hp = Math.floor(b.maxHp / 2) + 1;
    burnBoss(s);
    run(s, 1);
    expect(b.enraged).toBe(true);
    b.hp = 1;
    b.invulnUntil = 0;
    burnBoss(s);
    run(s, 1);
    expect(b.action).toBe('dead');
    expect(s.players[0].kills).toBe(1);
    run(s, secToTicks(2.5));
    expect(s.phase).toBe('ended');
    expect(s.result).toMatchObject({ outcome: 'victory', reason: 'bossesDefeated' });
  });

  it('slam sets a ring of fire that kills a player standing in it', () => {
    const s = start();
    const b = s.boss!;
    const p = s.players[0];
    // Stand two cells away from the body center, inside the slam ring.
    const ring = slamCells(s, b).find((c) => Math.max(Math.abs(c.x - b.x), Math.abs(c.y - b.y)) === 2)!;
    p.x = p.px = ring.x;
    p.y = p.py = ring.y;
    b.attack = 'slam';
    b.action = 'windup';
    b.actionUntil = s.tick + 1;
    run(s, 3);
    expect(p.alive).toBe(false);
    expect(s.result?.outcome).toBe('defeat');
  });

  it('touching the body is deadly and lava rain targets the players', () => {
    const s = start();
    const b = s.boss!;
    b.attack = 'meteors';
    b.action = 'windup';
    b.actionUntil = s.tick + 1;
    run(s, 2);
    expect(s.meteors.length).toBeGreaterThanOrEqual(BOSSES.golem.meteors);
    const p = s.players[0];
    p.x = p.px = b.x + 1;
    p.y = p.py = b.y;
    run(s, 1);
    expect(p.alive).toBe(false);
  });

  it('walks toward the nearest player and is deterministic for a given seed', () => {
    const a = start();
    const b = start();
    a.boss!.nextAttackTick = b.boss!.nextAttackTick = 1e9;
    const d0 = Math.abs(a.players[0].x - a.boss!.x) + Math.abs(a.players[0].y - a.boss!.y);
    run(a, 180);
    run(b, 180);
    const d1 = Math.abs(a.players[0].x - a.boss!.x) + Math.abs(a.players[0].y - a.boss!.y);
    expect(d1).toBeLessThan(d0);
    expect([a.boss!.x, a.boss!.y]).toEqual([b.boss!.x, b.boss!.y]);
  });
});

describe('Guardião Ancião', () => {
  /** Boss rush that starts directly on the Guardião. */
  function guardian() {
    const s = createGame({ ...config(1), bosses: ['guardian'] });
    run(s, s.countdownTicks + 1);
    expect(s.boss?.kind).toBe('guardian');
    return s;
  }

  it('roots erupt along the row and column of the player and kill on contact', () => {
    const s = guardian();
    const b = s.boss!;
    const p = s.players[0];
    b.attack = 'roots';
    b.targets = rootLines(s, b, p);
    expect(b.targets.some((c) => c.x === Math.round(p.x) && c.y === Math.round(p.y))).toBe(true);
    b.action = 'windup';
    b.actionUntil = s.tick + 1;
    run(s, 3);
    expect(s.flames.some((f) => f.style === 'root')).toBe(true);
    expect(p.alive).toBe(false);
  });

  it('spores summon sprouts that wither when the Guardião falls', () => {
    const s = guardian();
    const b = s.boss!;
    b.attack = 'spores';
    b.action = 'windup';
    b.actionUntil = s.tick + 1;
    run(s, 2);
    const sprouts = s.enemies.filter((e) => e.kind === 'sprout' && e.alive);
    expect(sprouts.length).toBe(BOSSES.guardian.sprouts);
    b.hp = 1;
    b.invulnUntil = 0;
    burnBoss(s);
    run(s, 1);
    expect(s.enemies.filter((e) => e.kind === 'sprout' && e.alive)).toHaveLength(0);
  });

  it('burrows (untouchable), then bursts out at the marked spot', () => {
    const s = guardian();
    const b = s.boss!;
    s.players[0].invulnUntil = 1e9;
    b.attack = 'burrow';
    b.targets = [{ x: 4, y: 7 }];
    b.action = 'windup';
    b.actionUntil = s.tick + 1;
    run(s, 2);
    expect(b.action).toBe('burrowed');
    const hp = b.hp;
    burnBoss(s);
    run(s, 2);
    expect(b.hp).toBe(hp); // can't be hurt underground
    run(s, secToTicks(BOSSES.guardian.burrowSec!) + 1);
    expect([b.x, b.y]).toEqual([4, 7]);
    expect(b.action).toBe('recover');
  });

  it('the boss rush goes Golem → Guardião → victory', () => {
    const s = start();
    expect(s.boss?.kind).toBe('golem');
    expect(s.bossQueue).toEqual(['guardian']);
    s.boss!.hp = 1;
    burnBoss(s);
    run(s, secToTicks(2.2) + secToTicks(2.5) + 3);
    expect(s.boss?.kind).toBe('guardian');
    expect(s.phase).toBe('playing');
    s.boss!.hp = 1;
    s.boss!.invulnUntil = 0;
    burnBoss(s);
    run(s, secToTicks(2.5));
    expect(s.result).toMatchObject({ outcome: 'victory', reason: 'bossesDefeated' });
  });
});

describe('B5: reworked bosses everywhere, variants and medals', () => {
  const rush = (bosses: ('golem' | 'guardian')[] = ['golem'], players = 1) => {
    const s = createGame({ ...config(players), classicBosses: false, bosses });
    run(s, s.countdownTicks + 1);
    for (const p of s.players) p.invulnUntil = 1e9;
    return s;
  };
  const kill = (s: GameState) => {
    const b = s.boss!;
    b.plates = 0;
    b.hp = 1;
    b.invulnUntil = 0;
    b.frozenUntil = 0;
    if (b.action === 'burrowed' || b.action === 'leaping') b.action = 'walk';
    burnBoss(s);
    const out: GameState['events'] = [];
    step(s, {});
    out.push(...s.events);
    return out;
  };

  it('the Boss Rush golem is the reworked one: armor plates and a lava ring arena', () => {
    const s = rush(['golem']);
    const b = s.boss!;
    expect(b).toMatchObject({ kind: 'golem', reworked: true, plates: 15 });
    expect(b.arena).toEqual({ x0: 1, y0: 1, x1: s.grid.w - 2, y1: s.grid.h - 2 });
    // A blast on an armored side only knocks a plate off.
    const hp = b.hp;
    burnBoss(s);
    step(s, {});
    expect(b.hp).toBe(hp);
    expect(b.plates).not.toBe(15);
  });

  it('the Boss Rush guardian grows its own three support roots and tears loose when they fall', () => {
    const s = rush(['guardian']);
    const b = s.boss!;
    expect(b).toMatchObject({ kind: 'guardian', reworked: true, rooted: true });
    expect(b.anchors).toHaveLength(3);
    for (const a of b.anchors!) expect(getCell(s.grid, a.x, a.y)).toBe(Cell.Wall);
    const a0 = b.anchors![0];
    const side = [
      { x: a0.x, y: a0.y + 1 },
      { x: a0.x, y: a0.y - 1 },
      { x: a0.x + 1, y: a0.y },
      { x: a0.x - 1, y: a0.y },
    ].find((c) => getCell(s.grid, c.x, c.y) !== Cell.Wall)!;
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      s.flames.push({ x: side.x, y: side.y, part: 'center', dir: null, bombId: 800 + i, ownerId: 'p1', bornTick: s.tick + 1, untilTick: s.tick + 3, kind: 'normal' });
      run(s, 1);
      seen.push(...s.events.map((e) => e.type));
      run(s, 4);
    }
    expect(a0.hp).toBe(0);
    expect(getCell(s.grid, a0.x, a0.y)).toBe(Cell.Floor);
    expect(seen).toContain('rootPurified');
    for (const a of b.anchors!) {
      a.hp = 0;
      setCell(s.grid, a.x, a.y, Cell.Floor);
    }
    run(s, 1);
    expect(s.events.some((e) => e.type === 'bossUprooted')).toBe(true);
    expect(b.rooted).toBe(false);
  });

  it('a clean, quick win is gold (three drops); someone falling costs a medal', () => {
    const s = rush(['golem', 'golem'], 2);
    const before = s.powerups.length;
    const ev = kill(s);
    const d = ev.find((e) => e.type === 'bossDefeated');
    expect(d).toMatchObject({ tier: 3, goals: { noDeaths: true, inTime: true, allAlive: true } });
    expect(s.powerups.length - before).toBe(3);
    run(s, secToTicks(2.2) + secToTicks(2.5) + 3);
    expect(s.boss?.kind).toBe('golem');
    const p2 = s.players[1];
    p2.invulnUntil = 0;
    p2.shield = 0;
    s.flames.push({ x: Math.round(p2.x), y: Math.round(p2.y), part: 'center', dir: null, bombId: 700, ownerId: 'meteor', bornTick: s.tick, untilTick: s.tick + 2, kind: 'normal' });
    run(s, 2);
    expect(p2.alive).toBe(false);
    const d2 = kill(s).find((e) => e.type === 'bossDefeated');
    expect(d2).toMatchObject({ tier: 1, goals: { noDeaths: false, inTime: true, allAlive: false } });
  });

  it('mist: strikes fall from the fog now and then', () => {
    const s = rush(['golem']);
    const b = s.boss!;
    b.mod = 'mist';
    b.nextMistTick = s.tick;
    b.nextAttackTick = 1e9;
    run(s, 2);
    expect(s.meteors.length).toBeGreaterThanOrEqual(2);
  });

  it('corrupted: violet motes come for the players, one extra phase, and they vanish with it', () => {
    const s = rush(['golem']);
    const b = s.boss!;
    b.mod = 'corrupted';
    b.nextMoteTick = s.tick;
    run(s, 2);
    expect(s.enemies.filter((e) => e.alive && e.kind === 'mote').length).toBeGreaterThan(0);
    // Four phases now: the last one at 15%.
    b.plates = 0;
    b.hp = Math.floor(b.maxHp * 0.15);
    b.phase = 2;
    b.invulnUntil = 0;
    b.frozenUntil = 0;
    burnBoss(s);
    step(s, {});
    expect(s.events.find((e) => e.type === 'bossPhase')).toMatchObject({ phase: 3, last: true });
    run(s, 70);
    kill(s);
    expect(s.enemies.filter((e) => e.alive && e.kind === 'mote')).toHaveLength(0);
  });

  it('motes drift toward the player and die to a blast', () => {
    const s = rush(['golem']);
    const b = s.boss!;
    b.mod = 'corrupted';
    b.nextMoteTick = s.tick;
    b.nextAttackTick = 1e9;
    run(s, 2);
    const m = s.enemies.find((e) => e.kind === 'mote')!;
    const p = s.players[0];
    const d0 = Math.abs(m.x - p.x) + Math.abs(m.y - p.y);
    b.nextMoteTick = 1e9;
    run(s, 180);
    expect(Math.abs(m.x - p.x) + Math.abs(m.y - p.y)).toBeLessThan(d0);
    s.flames.push({ x: Math.round(m.x), y: Math.round(m.y), part: 'center', dir: null, bombId: 701, ownerId: 'p1', bornTick: s.tick, untilTick: s.tick + 3, kind: 'normal' });
    run(s, 1);
    expect(m.alive).toBe(false);
  });
});
