import { describe, expect, it } from 'vitest';
import { BOSSES, Cell, secToTicks, type GameConfig } from '@4walls/shared';
import { createGame, getCell, rootLines, slamCells, step, type GameState } from '../src';

const config = (players = 1): GameConfig => ({
  mode: 'bossrush',
  seed: 1234,
  width: 0,
  height: 0,
  players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, slot: i, characterId: 'bombito', name: `P${i + 1}` })),
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
