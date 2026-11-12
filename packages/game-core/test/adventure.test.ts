import { ADVENTURE, Cell } from '@4walls/shared';
import { describe, expect, it } from 'vitest';
import { cellIndex, createGame, getCell, step, type GameState } from '../src';

const make = (seed = 11, players = 1) =>
  createGame({
    mode: 'adventure',
    seed,
    width: 0,
    height: 0,
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, slot: i, characterId: 'bombito', name: `P${i + 1}` })),
  });

/** Flood fill over cells a player can eventually reach (blocks are destructible, gates open). */
function reachable(s: GameState, from: { x: number; y: number }) {
  const seen = new Set<number>();
  const q = [from];
  const passable = (x: number, y: number) => {
    const c = getCell(s.grid, x, y);
    return c !== Cell.Wall || s.adventure!.gates.some((g) => g.x === x && g.y === y);
  };
  while (q.length) {
    const { x, y } = q.pop()!;
    const i = cellIndex(s.grid, x, y);
    if (seen.has(i) || !passable(x, y)) continue;
    seen.add(i);
    q.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  }
  return seen;
}

describe('adventure world', () => {
  it('builds several regions on a non-rectangular footprint with void around the islands', () => {
    for (let seed = 1; seed < 20; seed++) {
      const s = make(seed);
      const adv = s.adventure!;
      expect(adv.regions).toHaveLength(ADVENTURE.regions);
      // Void = walls that are neither pillars (even/even) nor gates: the sea around organic islands.
      let voidCells = 0;
      for (let y = 0; y < s.grid.h; y++)
        for (let x = 0; x < s.grid.w; x++) {
          if (getCell(s.grid, x, y) !== Cell.Wall || (x % 2 === 0 && y % 2 === 0)) continue;
          if (!adv.gates.some((g) => g.x === x && g.y === y)) voidCells++;
        }
      expect(voidCells).toBeGreaterThan(s.grid.w * s.grid.h * 0.2);
      const floor = Array.from(s.grid.cells).filter((c) => c !== Cell.Wall).length;
      expect(floor).toBeLessThan(s.grid.w * s.grid.h * 0.75); // organic islands, not a filled rectangle
    }
  });

  it('every region is reachable from the spawn once its gates are open', () => {
    for (let seed = 1; seed < 20; seed++) {
      const s = make(seed);
      const seen = reachable(s, { x: Math.round(s.players[0].x), y: Math.round(s.players[0].y) });
      const reached = new Set([...seen].map((i) => s.adventure!.regionOf[i]));
      for (const r of s.adventure!.regions) expect(reached.has(r.id), `seed ${seed} region ${r.id}`).toBe(true);
    }
  });

  it('gates start sealed; only region 0 is unlocked', () => {
    const s = make();
    const adv = s.adventure!;
    expect(adv.gates).toHaveLength(adv.regions.length - 1);
    for (const g of adv.gates) expect(getCell(s.grid, g.x, g.y)).toBe(Cell.Wall);
    expect(adv.regions.map((r) => r.unlocked)).toEqual([true, ...adv.regions.slice(1).map(() => false)]);
  });

  it('players reveal the fog around them, but never inside locked regions', () => {
    const s = make();
    const adv = s.adventure!;
    const p = s.players[0];
    expect(adv.explored[cellIndex(s.grid, Math.round(p.x), Math.round(p.y))]).toBe(1);
    // Teleport next to the sealed gate: cells beyond it stay hidden.
    const g = adv.gates[0];
    p.x = p.px = g.axis === 'h' ? g.x - 1 : g.x;
    p.y = p.py = g.axis === 'h' ? g.y : g.y + (adv.regions[1].cy > adv.regions[0].cy ? -1 : 1);
    s.phase = 'playing';
    for (let i = 0; i < 6; i++) step(s, {});
    const lockedSeen = Array.from(adv.explored).some((v, i) => v === 1 && adv.regionOf[i] === 1);
    expect(lockedSeen).toBe(false);
  });

  it('clearing a region opens its gate and unlocks the next one; clearing all wins', () => {
    const s = make();
    const adv = s.adventure!;
    s.phase = 'playing';
    for (const r of adv.regions) {
      for (const e of s.enemies) if (e.regionId === r.id) e.alive = false;
      step(s, {});
      expect(r.cleared).toBe(true);
      const g = adv.gates.find((gg) => gg.from === r.id);
      if (g) {
        expect(g.open).toBe(true);
        expect(getCell(s.grid, g.x, g.y)).toBe(Cell.Floor);
        expect(adv.regions[g.to].unlocked).toBe(true);
        expect(s.events.some((e) => e.type === 'gateOpened' && e.gateId === g.id)).toBe(true);
      }
    }
    expect(s.result).toMatchObject({ outcome: 'victory', reason: 'allRegionsCleared' });
  });

  it('opening a gate revives fallen allies at the gate, protected; departed players stay out', () => {
    const s = make(11, 3);
    const adv = s.adventure!;
    s.phase = 'playing';
    const [, p2, p3] = s.players;
    for (const p of [p2, p3]) {
      p.alive = false;
      p.diedTick = s.tick;
    }
    p3.left = true; // quit the online match
    for (const e of s.enemies) if (e.regionId === 0) e.alive = false;
    step(s, {});
    const g = adv.gates.find((gg) => gg.from === 0)!;
    expect(g.open).toBe(true);
    expect(p2.alive).toBe(true);
    expect(Math.abs(p2.x - g.x) + Math.abs(p2.y - g.y)).toBeLessThanOrEqual(2);
    expect(getCell(s.grid, p2.x, p2.y)).toBe(Cell.Floor);
    expect(p2.invulnUntil).toBeGreaterThan(s.tick + 60);
    expect(p3.alive).toBe(false);
    expect(s.events).toContainEqual({ type: 'playerRevived', playerId: p2.id, x: p2.x, y: p2.y });
  });

  it('each region has its own enemies, more in later regions', () => {
    const s = make();
    const counts = s.adventure!.regions.map((r) => s.enemies.filter((e) => e.regionId === r.id).length);
    expect(counts[0]).toBe(ADVENTURE.enemiesBase);
    expect(counts[counts.length - 1]).toBeGreaterThan(counts[0]);
  });

  it('is deterministic per seed and supports local co-op spawns', () => {
    const a = make(42, 4);
    const b = make(42, 4);
    expect(Array.from(a.grid.cells)).toEqual(Array.from(b.grid.cells));
    expect(new Set(a.players.map((p) => `${p.x},${p.y}`)).size).toBe(4);
    for (const p of a.players) expect(getCell(a.grid, p.x, p.y)).toBe(Cell.Floor);
  });
});
