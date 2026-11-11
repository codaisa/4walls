import { describe, expect, it } from 'vitest';
import { Cell, RULES, secToTicks, type GameConfig, type PlayerInput } from '@4walls/shared';
import { createGame, getCell, setCell, spawnBomb, step, type GameState } from '../src';

const config: GameConfig = {
  mode: 'versus',
  seed: 7,
  width: 15,
  height: 13,
  events: false,
  players: [
    { id: 'p1', slot: 0, characterId: 'bombito', name: 'P1' },
    { id: 'p2', slot: 1, characterId: 'bombito', name: 'P2' },
  ],
};

const idle: PlayerInput = { move: null, bomb: false, ability: false };

/** Playing state with an empty floor row y = 1 so moves have room. */
function setup() {
  const s = createGame(config);
  for (let i = 0; i < s.countdownTicks + 1; i++) step(s, {});
  for (let x = 1; x < s.grid.w - 1; x++) if (getCell(s.grid, x, 1) === Cell.Block) setCell(s.grid, x, 1, Cell.Floor);
  return s;
}

function press(s: GameState, input: PlayerInput, ticks = 1) {
  step(s, { p1: input });
  for (let i = 1; i < ticks; i++) step(s, { p1: idle });
}

describe('roll', () => {
  it('rolls two cells along the facing direction and is briefly untouchable', () => {
    const s = setup();
    const p = s.players[0];
    press(s, { ...idle, move: 'right', roll: true });
    expect(p.maneuver?.kind).toBe('roll');
    // A flame on the roll path does not hurt during the invulnerable frames.
    s.flames.push({ x: 2, y: 1, part: 'center', dir: null, bombId: 0, ownerId: 'p2', bornTick: s.tick, untilTick: s.tick + 3, kind: 'normal' });
    press(s, idle, secToTicks(RULES.rollSec) + 2);
    expect(p.alive).toBe(true);
    expect([p.x, p.y]).toEqual([3, 1]);
    expect(p.maneuver).toBeNull();
  });

  it('stops before walls and respects the cooldown', () => {
    const s = setup();
    const p = s.players[0];
    press(s, { ...idle, move: 'up', roll: true }, secToTicks(RULES.rollSec) + 1);
    expect([p.x, p.y]).toEqual([1, 1]); // the border is right above
    press(s, { ...idle, move: 'right', roll: true });
    expect(p.maneuver).toBeNull(); // still cooling down
  });
});

describe('jump', () => {
  it('hops over a bomb and lands two cells away', () => {
    const s = setup();
    const p = s.players[0];
    spawnBomb(s, { ownerId: 'p2', x: 2, y: 1, range: 1 });
    press(s, { ...idle, move: 'right', jump: true }, secToTicks(RULES.jumpSec) + 2);
    expect([p.x, p.y]).toEqual([3, 1]);
    expect(s.events.some((e) => e.type === 'playerLanded') || p.maneuver === null).toBe(true);
  });

  it('is immune to ground fire while airborne', () => {
    const s = setup();
    const p = s.players[0];
    press(s, { ...idle, move: 'right', jump: true }, 6);
    s.flames.push({ x: 2, y: 1, part: 'center', dir: null, bombId: 0, ownerId: 'p2', bornTick: s.tick, untilTick: s.tick + 8, kind: 'normal' });
    press(s, idle, 8);
    expect(p.alive).toBe(true);
  });
});

describe('glove throw', () => {
  it('throws your own bomb over a wall and it explodes where it lands', () => {
    const s = setup();
    const p = s.players[0];
    p.canThrow = true;
    for (let y = 2; y <= 7; y++) if (getCell(s.grid, 3, y) === Cell.Block) setCell(s.grid, 3, y, Cell.Floor);
    setCell(s.grid, 3, 2, Cell.Wall); // something to throw over
    p.x = p.px = 3;
    p.facing = 'down';
    press(s, { ...idle, bomb: true }); // place
    const bomb = s.bombs.find((b) => b.ownerId === 'p1')!;
    expect([bomb.x, bomb.y]).toEqual([3, 1]);
    press(s, { ...idle, bomb: true }); // throw (2,2)/(4,2) are pillars, the bomb flies over row 2
    const thrown = s.bombs.find((b) => b.id === bomb.id)!;
    expect(thrown.y).toBeGreaterThanOrEqual(1 + RULES.throwCells);
    expect(thrown.flightUntil).toBeGreaterThan(s.tick);
    expect(s.events.some((e) => e.type === 'bombThrown')).toBe(true);
    // Does not explode mid-air even if the fuse would run out.
    thrown.detonateTick = s.tick + 1;
    press(s, idle, 3);
    expect(s.bombs.some((b) => b.id === bomb.id)).toBe(true);
    press(s, idle, secToTicks(RULES.throwFlightSec) + 15);
    expect(s.bombs.some((b) => b.id === bomb.id)).toBe(false);
  });

  it('without the glove a second press does nothing', () => {
    const s = setup();
    const p = s.players[0];
    press(s, { ...idle, bomb: true });
    press(s, { ...idle, bomb: true });
    const b = s.bombs.find((bb) => bb.ownerId === p.id)!;
    expect([b.x, b.y]).toEqual([1, 1]);
    expect(b.flightUntil).toBe(0);
  });
});

describe('versus alone', () => {
  it('a single Versus player practices against Magmitos instead of winning instantly', () => {
    const s = createGame({ ...config, players: [config.players[0]] });
    for (let i = 0; i < s.countdownTicks + 5; i++) step(s, {});
    expect(s.phase).toBe('playing');
    expect(s.enemies.length).toBeGreaterThan(0);
    for (const e of s.enemies) e.alive = false;
    step(s, {});
    expect(s.result).toMatchObject({ outcome: 'victory', reason: 'allEnemiesDown' });
  });
});
