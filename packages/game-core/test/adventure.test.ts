import { ADVENTURE, Cell, DIR_VEC, DIRS } from '@4walls/shared';
import { describe, expect, it } from 'vitest';
import { cellIndex, createGame, difficulty, geyserPhase, getCell, inBounds, platformPos, regionAt, regionInfo, regionMods, setCell, step, syncAdventureWindow, type GameState } from '../src';

const make = (seed = 11, players = 1) => {
  const s = createGame({
    mode: 'adventure',
    seed,
    width: 0,
    height: 0,
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, slot: i, characterId: 'bombito', name: `P${i + 1}` })),
  });
  s.phase = 'playing';
  return s;
};
const region = (s: GameState, id: number) => s.adventure!.regions.find((r) => r.id === id)!;
const exitGate = (s: GameState, id: number) => s.adventure!.gates.find((g) => g.kind !== 'back' && g.from === id)!;

/** Clears region `id` (kills its Magmitos or delivers its key) and steps once. */
function complete(s: GameState, id: number) {
  const r = region(s, id);
  if (r.objective.kind === 'clear') {
    for (const e of s.enemies) if (e.regionId === id) e.alive = false;
  } else if (r.objective.kind === 'lever') {
    const lever = s.adventure!.props.find((p) => p.kind === 'lever' && p.region === id)!;
    const side = DIRS.map((d) => ({ x: lever.x + DIR_VEC[d].x, y: lever.y + DIR_VEC[d].y })).find((c) => getCell(s.grid, c.x, c.y) === Cell.Floor)!;
    s.flames.push({ x: side.x, y: side.y, part: 'center', dir: null, bombId: 1, ownerId: 'p1', bornTick: s.tick, untilTick: s.tick + 30, kind: 'normal' });
  } else {
    const key = s.adventure!.props.find((p) => p.kind === 'key' && p.region === id)!;
    key.state = 'used';
  }
  step(s, {});
}

/** Moves every living player through the open exit gate of region `id` into region id + 1. */
function walkThrough(s: GameState, id: number) {
  const next = region(s, id + 1);
  for (const p of s.players.filter((pp) => pp.alive)) {
    p.x = p.px = next.entry!.x;
    p.y = p.py = next.entry!.y;
  }
  step(s, {});
}

/** Cells reachable from a point, treating crates (and cages) as passable and walls as not. */
function reach(s: GameState, from: { x: number; y: number }) {
  // River crossings (bridges, the platform's track) are walkable over time.
  const crossing = new Set<number>();
  for (const p of s.adventure!.props) {
    if (p.kind === 'bridge') crossing.add(cellIndex(s.grid, p.x, p.y));
    if (p.kind === 'platform') for (const c of p.track!) crossing.add(cellIndex(s.grid, c.x, c.y));
  }
  const seen = new Set<number>([cellIndex(s.grid, from.x, from.y)]);
  const q = [from];
  while (q.length) {
    const c = q.shift()!;
    for (const d of DIRS) {
      const x = c.x + DIR_VEC[d].x;
      const y = c.y + DIR_VEC[d].y;
      if (!inBounds(s.grid, x, y)) continue;
      const i = cellIndex(s.grid, x, y);
      const cell = getCell(s.grid, x, y);
      if (seen.has(i) || cell === Cell.Wall || (cell === Cell.Lava && !crossing.has(i))) continue;
      seen.add(i);
      q.push({ x, y });
    }
  }
  return seen;
}

describe('endless adventure: world', () => {
  it('starts with the first region live and the second one waiting behind a sealed gate', () => {
    const s = make();
    const adv = s.adventure!;
    expect(adv.regions.map((r) => r.id)).toEqual([0, 1]);
    expect(region(s, 0).unlocked).toBe(true);
    expect(region(s, 1).unlocked).toBe(false);
    const g = exitGate(s, 0);
    expect(getCell(s.grid, g.x, g.y)).toBe(Cell.Wall);
    for (const p of s.players) expect(regionAt(s, p.x, p.y)).toBe(0);
  });

  it('is deterministic: same seed, same regions, wherever and whenever they are generated', () => {
    const a = make(42, 4);
    const b = make(42, 4);
    expect(Array.from(a.grid.cells)).toEqual(Array.from(b.grid.cells));
    expect(a.adventure!.props).toEqual(b.adventure!.props);
    expect(new Set(a.players.map((p) => `${p.x},${p.y}`)).size).toBe(4);
    // A mirror that only knows the window ids rebuilds exactly the same geometry.
    const mirror = make(42, 4);
    syncAdventureWindow(mirror, [0, 1]);
    expect(Array.from(mirror.grid.cells)).toEqual(Array.from(a.grid.cells));
  });

  it('scripted introduction, then seeded names and objectives', () => {
    expect([0, 1, 2, 3, 4].map((i) => regionInfo(7, i).name)).toEqual(['Caldeira Rasa', 'Campos de Cinza', 'Rio de Magma', 'Ponte de Obsidiana', 'Bosque Chamuscado']);
    expect(regionInfo(7, 1).objective).toBe('key');
    const later = Array.from({ length: 40 }, (_, i) => regionInfo(7, 5 + i));
    expect(new Set(later.map((r) => r.name)).size).toBeGreaterThan(15);
    expect(new Set(later.map((r) => r.objective))).toEqual(new Set(['clear', 'key', 'lever']));
    expect(regionInfo(7, 12)).toEqual(regionInfo(7, 12));
  });

  it('difficulty keeps growing but is capped', () => {
    expect(difficulty(0).enemies).toBe(2);
    for (let d = 1; d < 200; d++) {
      expect(difficulty(d).enemies).toBeGreaterThanOrEqual(difficulty(d - 1).enemies);
      expect(difficulty(d).enemySpeed).toBeGreaterThanOrEqual(difficulty(d - 1).enemySpeed);
    }
    expect(difficulty(500).enemies).toBe(ADVENTURE.enemiesCap);
    expect(difficulty(500).enemySpeed).toBeLessThanOrEqual(1.6);
  });
});

describe('endless adventure: the journey', () => {
  it('a done objective opens the gate; entering a region attaches the next; the way back seals', () => {
    const s = make(5, 2);
    complete(s, 0);
    const g0 = exitGate(s, 0);
    expect(g0.open).toBe(true);
    expect(getCell(s.grid, g0.x, g0.y)).toBe(Cell.Floor);
    expect(region(s, 1).unlocked).toBe(true);

    walkThrough(s, 0);
    const adv = s.adventure!;
    expect(adv.depth).toBe(1);
    expect(adv.regions.map((r) => r.id)).toEqual([1, 2]); // everyone in: region 0 dropped at once
    expect(adv.gates.some((g) => g.kind === 'back')).toBe(true);
    expect(getCell(s.grid, region(s, 1).entry!.x, region(s, 1).entry!.y)).toBe(Cell.Wall);
    expect(s.enemies.every((e) => e.regionId >= 1)).toBe(true);
    expect(adv.journey.map((j) => j.id)).toEqual([0, 1]);
  });

  it('stragglers are pulled through when the gate behind closes', () => {
    const s = make(5, 2);
    complete(s, 0);
    const [p1, p2] = s.players;
    s.enemies = []; // nothing should interfere with the gate timing
    p1.x = p1.px = region(s, 1).entry!.x;
    p1.y = p1.py = region(s, 1).entry!.y;
    step(s, {});
    expect(s.adventure!.closing).not.toBeNull();
    expect(regionAt(s, p2.x, p2.y)).toBe(0);
    for (let i = 0; i < 16 * 60; i++) step(s, {});
    expect(s.adventure!.regions.some((r) => r.id === 0)).toBe(false);
    expect(regionAt(s, p2.x, p2.y)).toBe(1);
    expect(getCell(s.grid, Math.round(p2.x), Math.round(p2.y))).toBe(Cell.Floor);
  });

  it('never ends while someone is alive: 30 regions deep, the window stays small and coordinates keep growing', () => {
    const s = make(9, 1);
    for (let id = 0; id < 30; id++) {
      complete(s, id);
      walkThrough(s, id);
      expect(s.result).toBeNull();
      expect(s.adventure!.regions.length).toBeLessThanOrEqual(3);
      expect(s.grid.w * s.grid.h).toBeLessThanOrEqual(3 * ADVENTURE.chunkW * ADVENTURE.chunkH * 3);
    }
    expect(s.adventure!.depth).toBe(30);
    expect(s.grid.x0).toBeGreaterThan(0);
    // Only a full wipe ends it.
    s.players[0].alive = false;
    step(s, {});
    expect(s.result).toMatchObject({ outcome: 'defeat', reason: 'allPlayersDown' });
  });

  it('every generated region is solvable: exit, key, cage and chests are reachable from the arrival point', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = make(seed, 1);
      for (let id = 0; id < 8; id++) {
        const r = region(s, id);
        const start = r.entry ?? { x: Math.round(s.players[0].x), y: Math.round(s.players[0].y) };
        const seen = reach(s, start);
        const g = exitGate(s, id);
        const gateNeighbor = DIRS.map((d) => ({ x: g.x + DIR_VEC[d].x, y: g.y + DIR_VEC[d].y })).some((c) => inBounds(s.grid, c.x, c.y) && seen.has(cellIndex(s.grid, c.x, c.y)) && regionAt(s, c.x, c.y) === id);
        expect(gateNeighbor, `seed ${seed} region ${id}: exit`).toBe(true);
        const isletOf = (pp: { x: number; y: number }) => DIRS.filter((d) => getCell(s.grid, pp.x + DIR_VEC[d].x, pp.y + DIR_VEC[d].y) === Cell.Lava).length >= 2;
        for (const p of s.adventure!.props.filter((pp) => pp.region === id && !['brazier', 'lever', 'bridge', 'platform'].includes(pp.kind) && !isletOf(pp))) {
          // Secret chests sit behind a cracked wall: open it for the check.
          for (const d of DIRS) {
            const x = p.x + DIR_VEC[d].x;
            const y = p.y + DIR_VEC[d].y;
            if (getCell(s.grid, x, y) === Cell.Cracked) setCell(s.grid, x, y, Cell.Floor);
          }
          expect(reach(s, start).has(cellIndex(s.grid, p.x, p.y)), `seed ${seed} region ${id}: ${p.kind}`).toBe(true);
        }
        // Braziers and levers stand like pillars: one of their sides must be reachable.
        for (const b of s.adventure!.props.filter((pp) => pp.region === id && (pp.kind === 'brazier' || pp.kind === 'lever'))) {
          const side = DIRS.some((d) => {
            const x = b.x + DIR_VEC[d].x;
            const y = b.y + DIR_VEC[d].y;
            return inBounds(s.grid, x, y) && seen.has(cellIndex(s.grid, x, y));
          });
          expect(side, `seed ${seed} region ${id}: brazier`).toBe(true);
        }
        const cage = s.adventure!.cages.find((c) => c.region === id);
        if (cage) expect(seen.has(cellIndex(s.grid, cage.x, cage.y)), `seed ${seed} region ${id}: cage`).toBe(true);
        complete(s, id);
        walkThrough(s, id);
      }
    }
  });
});

describe('endless adventure: props', () => {
  /** Region 1 of seed 3 has a key objective (scripted). */
  const atKeyRegion = () => {
    const s = make(3, 2);
    complete(s, 0);
    walkThrough(s, 0);
    return s;
  };

  it('the key: pick it up, it slows the carrier, drop it on death, deliver it at the gate', () => {
    const s = atKeyRegion();
    const key = s.adventure!.props.find((p) => p.kind === 'key' && p.region === 1)!;
    const [p1] = s.players;
    p1.x = p1.px = key.x;
    p1.y = p1.py = key.y;
    step(s, {});
    expect(key.state).toBe('carried');
    expect(key.carrierId).toBe('p1');
    // Dies → the key stays where they fell.
    p1.alive = false;
    step(s, {});
    expect(key.state).toBe('idle');
    // A friend carries it to the gate.
    const p2 = s.players[1];
    p2.x = p2.px = key.x;
    p2.y = p2.py = key.y;
    step(s, {});
    expect(key.carrierId).toBe('p2');
    const g = exitGate(s, 1);
    const inside = DIRS.map((d) => ({ x: g.x + DIR_VEC[d].x, y: g.y + DIR_VEC[d].y })).find((c) => regionAt(s, c.x, c.y) === 1 && getCell(s.grid, c.x, c.y) === Cell.Floor)!;
    p2.x = p2.px = inside.x;
    p2.y = p2.py = inside.y;
    step(s, {});
    step(s, {});
    expect(key.state).toBe('used');
    expect(g.open).toBe(true);
    expect(p1.alive).toBe(true); // the gate brings the fallen back
  });

  it('chests open when touched or blasted and drop loot; secret chests hide behind cracked walls', () => {
    let found = false;
    for (let seed = 1; seed < 40 && !found; seed++) {
      const s = make(seed, 1);
      const chest = s.adventure!.props.find((p) => p.kind === 'chest' && p.rare && p.region === 0);
      if (!chest) continue;
      found = true;
      const cracked = DIRS.map((d) => ({ x: chest.x + DIR_VEC[d].x, y: chest.y + DIR_VEC[d].y })).find((c) => getCell(s.grid, c.x, c.y) === Cell.Cracked)!;
      expect(cracked).toBeTruthy();
      const p = s.players[0];
      p.x = p.px = chest.x;
      p.y = p.py = chest.y;
      step(s, {});
      expect(chest.state).toBe('open');
      expect(s.events.some((e) => e.type === 'chestOpened' && e.rare)).toBe(true);
      expect(s.powerups.length + s.events.filter((e) => e.type === 'powerupCollected').length).toBeGreaterThanOrEqual(2);
    }
    expect(found).toBe(true);
  });
});

describe('endless adventure: M2 mechanics', () => {
  const atRegion1 = (seed = 3) => {
    const s = make(seed, 1);
    complete(s, 0);
    walkThrough(s, 0);
    return s;
  };

  it('"A infestação" brings Fagulhas, ash vents, the braziers mission and a plaza with loops', () => {
    const s = atRegion1();
    const props = s.adventure!.props.filter((p) => p.region === 1);
    expect(s.enemies.filter((e) => e.regionId === 1 && e.kind === 'spark')).toHaveLength(2);
    expect(props.filter((p) => p.kind === 'vent')).toHaveLength(2);
    expect(props.filter((p) => p.kind === 'brazier')).toHaveLength(3);
    expect(props.find((p) => p.kind === 'chest' && p.state === 'hidden')).toBeTruthy();
    expect(regionMods(3, 1).shape).toBe('plaza');
  });

  it('the scripted braziers mission shows up in region 2 for (almost) every seed', () => {
    let ok = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = make(seed, 1);
      if (s.adventure!.props.filter((p) => p.region === 1 && p.kind === 'brazier').length === 3) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(38);
  });

  it('later regions draw mechanics from the seed, with more Fagulhas the deeper you go', () => {
    const deep = Array.from({ length: 60 }, (_, i) => regionMods(21, 5 + i));
    expect(deep.some((m) => m.shape === 'plaza')).toBe(true);
    expect(deep.some((m) => m.braziers)).toBe(true);
    expect(deep.some((m) => m.vents > 0)).toBe(true);
    expect(regionMods(21, 60).sparks).toBeGreaterThanOrEqual(regionMods(21, 6).sparks);
    expect(regionMods(21, 9)).toEqual(regionMods(21, 9));
  });

  it('a Fagulha spots a player in a clear line, warns, charges until blocked, then rests', () => {
    const s = make(4, 1);
    // A clean corridor: clear a row and put a Fagulha at one end, the player at the other.
    const p = s.players[0];
    const y = Math.round(p.y);
    const x0 = Math.round(p.x);
    for (let x = x0 - 4; x <= x0; x++) setCell(s.grid, x, y, Cell.Floor);
    setCell(s.grid, x0 - 5, y, Cell.Wall);
    s.enemies = [{ id: 999, kind: 'spark', x: x0 - 4, y, px: x0 - 4, py: y, dir: null, tx: x0 - 4, ty: y, alive: true, diedTick: -1, frozenUntil: 0, regionId: 0, mode: 'wander', modeUntil: 0 }];
    const f = s.enemies[0];
    p.invulnUntil = 1e9; // watch the charge without dying
    step(s, {});
    expect(f.mode).toBe('alert');
    expect(f.dir).toBe('right');
    expect(s.events.some((e) => e.type === 'sparkAlert')).toBe(true);
    const at = f.x;
    for (let i = 0; i < 40; i++) step(s, {});
    expect(f.mode).toBe('charge');
    expect(f.x).toBeGreaterThan(at + 1);
    for (let i = 0; i < 120 && f.mode === 'charge'; i++) step(s, {});
    expect(f.mode).toBe('rest');
  });

  it('a Fagulha does not see through crates', () => {
    const s = make(4, 1);
    const p = s.players[0];
    const y = Math.round(p.y);
    const x0 = Math.round(p.x);
    for (let x = x0 - 4; x <= x0; x++) setCell(s.grid, x, y, Cell.Floor);
    setCell(s.grid, x0 - 2, y, Cell.Block);
    s.enemies = [{ id: 999, kind: 'spark', x: x0 - 4, y, px: x0 - 4, py: y, dir: null, tx: x0 - 4, ty: y, alive: true, diedTick: -1, frozenUntil: 0, regionId: 0, mode: 'wander', modeUntil: 0 }];
    step(s, {});
    expect(s.enemies[0].mode).not.toBe('alert');
  });

  it('three braziers lit by blasts next to them reveal the rare chest', () => {
    const s = atRegion1();
    const braziers = s.adventure!.props.filter((p) => p.region === 1 && p.kind === 'brazier');
    const chest = s.adventure!.props.find((p) => p.region === 1 && p.kind === 'chest' && p.state === 'hidden')!;
    for (const b of braziers) {
      const side = DIRS.map((d) => ({ x: b.x + DIR_VEC[d].x, y: b.y + DIR_VEC[d].y })).find((c) => getCell(s.grid, c.x, c.y) !== Cell.Wall)!;
      s.flames.push({ x: side.x, y: side.y, part: 'center', dir: null, bombId: -1, ownerId: 'p1', bornTick: s.tick, untilTick: s.tick + 30, kind: 'normal' });
      step(s, {});
      expect(b.state).toBe('lit');
    }
    expect(chest.state).toBe('closed');
    expect(s.events.some((e) => e.type === 'missionDone')).toBe(true);
  });
});

describe('endless adventure: M3 lava river', () => {
  /** Region 3 ("Rio de Magma", index 2) is the scripted river. */
  const atRiver = (seed = 3, players = 1) => {
    const s = make(seed, players);
    for (const id of [0, 1]) {
      complete(s, id);
      walkThrough(s, id);
    }
    for (const p of s.players) p.invulnUntil = 0;
    s.enemies = [];
    return s;
  };
  const props = (s: GameState, kind: string) => s.adventure!.props.filter((p) => p.region === 2 && p.kind === kind);
  const floorSide = (s: GameState, c: { x: number; y: number }) => DIRS.map((d) => ({ x: c.x + DIR_VEC[d].x, y: c.y + DIR_VEC[d].y })).find((q) => getCell(s.grid, q.x, q.y) === Cell.Floor)!;

  it('"A travessia": a lava band with a raised drawbridge, fragile planks, a shuttle, a lever and geysers', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const s = atRiver(seed);
      expect(region(s, 2).objective.kind).toBe('lever');
      const draw = props(s, 'bridge').filter((b) => b.variant === 'draw');
      expect(draw.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
      for (const b of draw) expect(getCell(s.grid, b.x, b.y)).toBe(Cell.Lava);
      expect(props(s, 'lever')).toHaveLength(1);
      expect(props(s, 'platform').length + props(s, 'bridge').filter((b) => b.variant === 'fragile').length, `seed ${seed}`).toBeGreaterThan(0);
      expect(props(s, 'geyser').length).toBeGreaterThanOrEqual(1);
    }
  });

  it('a blast next to the lever lowers the drawbridge and opens the exit gate', () => {
    const s = atRiver();
    complete(s, 2);
    for (const b of props(s, 'bridge').filter((x) => x.variant === 'draw')) {
      expect(b.state).toBe('lowered');
      expect(getCell(s.grid, b.x, b.y)).toBe(Cell.Floor);
    }
    expect(exitGate(s, 2).open).toBe(true);
  });

  it('fragile planks shake, give way under whoever stays, then come back', () => {
    let s = atRiver(1, 2);
    for (let seed = 2; !props(s, 'bridge').some((b) => b.variant === 'fragile'); seed++) s = atRiver(seed, 2);
    const plank = props(s, 'bridge').find((b) => b.variant === 'fragile')!;
    const p = s.players[0];
    p.x = p.px = plank.x;
    p.y = p.py = plank.y;
    step(s, {});
    expect(plank.state).toBe('cracking');
    let fell = false;
    for (let i = 0; i < 61; i++) {
      step(s, {});
      fell ||= s.events.some((e) => e.type === 'playerFell');
    }
    expect(plank.state).toBe('fallen');
    expect(getCell(s.grid, plank.x, plank.y)).toBe(Cell.Lava);
    expect(p.alive).toBe(false);
    expect(fell).toBe(true);
    for (let i = 0; i < 361; i++) step(s, {});
    expect(plank.state).toBe('solid');
    expect(getCell(s.grid, plank.x, plank.y)).toBe(Cell.Floor);
  });

  it('the shuttle platform carries its rider across the river', () => {
    let s = atRiver(1, 2);
    for (let seed = 2; !props(s, 'platform').length; seed++) s = atRiver(seed, 2);
    const plat = props(s, 'platform')[0];
    // Wait for it at the near bank, step on, ride.
    for (let i = 0; i < 400 && platformPos(plat, s.tick).x !== plat.track![0].x + 0 * 1; i++) step(s, {});
    let guard = 0;
    while (!(platformPos(plat, s.tick).i === 0 && platformPos(plat, s.tick + 30).i === 0) && guard++ < 600) step(s, {});
    const p = s.players[0];
    p.x = p.px = plat.track![0].x;
    p.y = p.py = plat.track![0].y;
    const far = plat.track![plat.track!.length - 1];
    for (let i = 0; i < 400 && !(Math.round(p.x) === far.x && Math.round(p.y) === far.y); i++) step(s, {});
    expect(p.alive).toBe(true);
    expect([Math.round(p.x), Math.round(p.y)]).toEqual([far.x, far.y]);
    // Only the platform's cell is floor; the rest of its track is lava.
    for (const c of plat.track!) expect(getCell(s.grid, c.x, c.y)).toBe(c.x === plat.x && c.y === plat.y ? Cell.Floor : Cell.Lava);
  });

  it('a geyser warns, then erupts like a flame: deadly, and it sets bombs off', () => {
    const s = atRiver();
    const g = props(s, 'geyser')[0];
    while (geyserPhase(g, s.tick + 1) !== 0) step(s, {});
    const p = s.players[0];
    p.x = p.px = g.x;
    p.y = p.py = g.y;
    step(s, {});
    expect(s.events.some((e) => e.type === 'geyserErupt')).toBe(true);
    step(s, {});
    expect(p.alive).toBe(false);
  });

  it('nobody walks into lava, but a jump clears one cell of it', () => {
    const s = atRiver();
    const lavaCell = props(s, 'bridge').find((b) => b.variant === 'draw')!;
    const bank = floorSide(s, lavaCell);
    const p = s.players[0];
    p.x = p.px = bank.x;
    p.y = p.py = bank.y;
    const dir = DIRS.find((d) => bank.x + DIR_VEC[d].x === lavaCell.x && bank.y + DIR_VEC[d].y === lavaCell.y)!;
    for (let i = 0; i < 30; i++) step(s, { p1: { move: dir, bomb: false, ability: false } });
    expect(getCell(s.grid, Math.round(p.x), Math.round(p.y))).toBe(Cell.Floor);
    expect(p.alive).toBe(true);
    // Jumping from the bank over one lava cell onto a free cell (if any) is allowed.
    setCell(s.grid, lavaCell.x + DIR_VEC[dir].x, lavaCell.y + DIR_VEC[dir].y, Cell.Floor);
    p.x = p.px = bank.x;
    p.y = p.py = bank.y;
    p.maneuverReadyTick = 0;
    step(s, { p1: { move: dir, bomb: false, ability: false, jump: true } });
    for (let i = 0; i < 40; i++) step(s, {});
    expect(p.alive).toBe(true);
    expect([Math.round(p.x), Math.round(p.y)]).toEqual([lavaCell.x + DIR_VEC[dir].x, lavaCell.y + DIR_VEC[dir].y]);
  });
});
