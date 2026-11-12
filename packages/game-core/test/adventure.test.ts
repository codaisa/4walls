import { ADVENTURE, BOSSES, Cell, DIR_VEC, DIRS, campActionIndex, RELIC_IDS } from '@4walls/shared';
import { describe, expect, it } from 'vitest';
import { addCoins, grantRelic, addResident, ELITE_MAGMITE_HP, MIMIC_HP, elitesFor, makeEnemy, ALL_PLATES, arcBoss, bodySide, lavaRing, leapCells, spawnBoss, arcInfo, arcOfRegion, chamberCenter, isPit, cellIndex, createGame, difficulty, geyserPhase, regionDifficulty, spawnBomb, getCell, inBounds, platformPos, regionAt, regionInfo, regionMods, setCell, step, syncAdventureWindow, type GameState } from '../src';

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
  } else if (r.objective.kind === 'seals' || r.objective.kind === 'purify') {
    for (const p of s.adventure!.props) if (p.region === id && (p.kind === 'seal' || p.kind === 'root')) p.state = 'broken';
  } else if (r.objective.kind === 'camp') {
    // Everyone gathers at the fire (it lights and saves on the next step).
    const fire = s.adventure!.props.find((p) => p.region === id && p.kind === 'campfire')!;
    for (const p of s.players.filter((pp) => pp.alive)) {
      p.x = p.px = fire.x - 2;
      p.y = p.py = fire.y;
    }
  } else if (r.objective.kind === 'boss') {
    // The chamber's boss falls (its own fight is covered in boss tests).
    r.objective.progress = r.objective.goal;
    s.boss = null;
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
      if (seen.has(i) || cell === Cell.Wall || ((cell === Cell.Lava || cell === Cell.Chasm) && !crossing.has(i))) continue;
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
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => regionInfo(7, i).name)).toEqual(['Caldeira Rasa', 'Campos de Cinza', 'Rio de Magma', 'Ponte de Obsidiana', 'Câmara do Golem', 'Pouso da Fogueira', 'Bosque Chamuscado']);
    expect(regionInfo(7, 1).objective).toBe('key');
    const later = Array.from({ length: 40 }, (_, i) => regionInfo(7, 5 + i));
    expect(new Set(later.map((r) => r.name)).size).toBeGreaterThan(15);
    expect(new Set(later.map((r) => r.objective))).toEqual(new Set(['clear', 'key', 'lever', 'seals', 'purify', 'boss', 'camp']));
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
    // A full wipe no longer ends it: the group wakes at the last camp (Task 3).
    s.players[0].alive = false;
    for (let i = 0; i < 60 * 3; i++) step(s, {});
    expect(s.result).toBeNull();
    expect(s.players[0].alive).toBe(true);
    expect(s.expedition!.camp).toBeGreaterThan(0);
    expect(regionAt(s, s.players[0].x, s.players[0].y)).toBe(s.expedition!.camp);
    expect(regionInfo(s.config.seed, s.expedition!.camp).objective).toBe('camp');
  });

  it('every generated region is solvable: exit, key, cage and chests are reachable from the arrival point', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s = make(seed, 1);
      for (let id = 0; id < (seed <= 25 ? 22 : 8); id++) {
        const r = region(s, id);
        const start = r.entry ?? { x: Math.round(s.players[0].x), y: Math.round(s.players[0].y) };
        const seen = reach(s, start);
        const g = exitGate(s, id);
        const gateNeighbor = DIRS.map((d) => ({ x: g.x + DIR_VEC[d].x, y: g.y + DIR_VEC[d].y })).some((c) => inBounds(s.grid, c.x, c.y) && seen.has(cellIndex(s.grid, c.x, c.y)) && regionAt(s, c.x, c.y) === id);
        expect(gateNeighbor, `seed ${seed} region ${id}: exit`).toBe(true);
        const isletOf = (pp: { x: number; y: number }) => DIRS.filter((d) => getCell(s.grid, pp.x + DIR_VEC[d].x, pp.y + DIR_VEC[d].y) === Cell.Lava).length >= 2;
        for (const p of s.adventure!.props.filter((pp) => pp.region === id && !['brazier', 'lever', 'bridge', 'platform', 'seal', 'root', 'bramble', 'grass', 'totem', 'campfire', 'tent', 'vault', 'board'].includes(pp.kind) && !isletOf(pp))) {
          // Secret chests sit behind a cracked wall: open it for the check.
          for (const d of DIRS) {
            const x = p.x + DIR_VEC[d].x;
            const y = p.y + DIR_VEC[d].y;
            if (getCell(s.grid, x, y) === Cell.Cracked) setCell(s.grid, x, y, Cell.Floor);
          }
          expect(reach(s, start).has(cellIndex(s.grid, p.x, p.y)), `seed ${seed} region ${id}: ${p.kind}`).toBe(true);
        }
        // Braziers and levers stand like pillars: one of their sides must be reachable.
        for (const b of s.adventure!.props.filter((pp) => pp.region === id && ['brazier', 'lever', 'seal', 'root', 'totem', 'campfire', 'tent', 'vault', 'board'].includes(pp.kind))) {
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
    expect(regionMods(21, [60, 61, 62].find((i) => regionInfo(21, i).objective !== 'boss')!).sparks).toBeGreaterThanOrEqual(regionMods(21, 6).sparks);
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
    p.hearts = 1; // the last heart
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

describe('endless adventure: M4 obsidian and forest', () => {
  /** Walk the group to region `target` (completing everything before it). */
  const reach = (target: number, seed = 3, players = 2) => {
    const s = make(seed, players);
    for (let id = 0; id < target; id++) {
      complete(s, id);
      walkThrough(s, id);
    }
    s.enemies = [];
    return s;
  };
  const props = (s: GameState, region: number, kind: string) => s.adventure!.props.filter((p) => p.region === region && p.kind === kind);
  const openSides = (s: GameState, c: { x: number; y: number }) =>
    DIRS.map((d) => ({ x: c.x + DIR_VEC[d].x, y: c.y + DIR_VEC[d].y })).filter((q) => getCell(s.grid, q.x, q.y) === Cell.Floor);

  it('"O guardião": an obsidian causeway over a chasm, with three seals', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = reach(3, seed, 1);
      expect(region(s, 3).objective.kind).toBe('seals');
      expect(props(s, 3, 'seal')).toHaveLength(3);
      let chasm = 0;
      const r = region(s, 3);
      for (let y = r.cy * 14; y < r.cy * 14 + 14; y++) for (let x = r.cx * 16; x < r.cx * 16 + 16; x++) if (getCell(s.grid, x, y) === Cell.Chasm) chasm++;
      expect(chasm, `seed ${seed}`).toBeGreaterThan(15);
    }
  });

  it('seals shrug off a single bomb and only crack under chain explosions', () => {
    const s = reach(3);
    const seal = props(s, 3, 'seal')[0];
    const sides = openSides(s, seal);
    expect(sides.length).toBeGreaterThan(0);
    // One bomb next to it: nothing.
    for (const p of s.players) p.invulnUntil = 1e9;
    const lone = spawnBomb(s, { ownerId: 'p1', x: sides[0].x, y: sides[0].y, range: 1 });
    lone.detonateTick = s.tick + 1;
    let resisted = false;
    for (let i = 0; i < 3; i++) {
      step(s, {});
      resisted ||= s.events.some((e) => e.type === 'sealResisted');
    }
    expect(resisted).toBe(true);
    expect(seal.hp).toBe(3);
    // Two bombs side by side going off together (a chain): one crack per chain.
    for (let hit = 1; hit <= 3; hit++) {
      const a = sides[0];
      const v = { x: a.x - seal.x, y: a.y - seal.y };
      const b = { x: a.x + v.x, y: a.y + v.y };
      s.flames = [];
      if (getCell(s.grid, b.x, b.y) !== Cell.Floor) setCell(s.grid, b.x, b.y, Cell.Floor);
      spawnBomb(s, { ownerId: 'p1', x: b.x, y: b.y, range: 2 });
      spawnBomb(s, { ownerId: 'p1', x: a.x, y: a.y, range: 1 }).detonateTick = s.tick + 1;
      for (const p of s.players) p.invulnUntil = 1e9;
      step(s, {});
      expect(seal.hp).toBe(3 - hit);
      for (let i = 0; i < 40; i++) step(s, {});
    }
    expect(seal.state).toBe('broken');
    expect(getCell(s.grid, seal.x, seal.y)).toBe(Cell.Floor);
  });

  it('"A corrupção": three corrupted roots; brambles grow back until the last root is purified', () => {
    const s = reach(6);
    expect(region(s, 6).objective.kind).toBe('purify');
    const roots = props(s, 6, 'root');
    expect(roots).toHaveLength(3);
    const bramble = props(s, 6, 'bramble')[0];
    expect(bramble).toBeTruthy();
    for (const p of s.players) {
      p.x = p.px = roots[0].x;
      p.y = p.py = roots[0].y; // out of the way (inside the root cell; positions only matter for regrowth)
      p.invulnUntil = 1e9;
    }
    // Cut the bramble: it grows back while roots live.
    setCell(s.grid, bramble.x, bramble.y, Cell.Floor);
    for (let i = 0; i < 620; i++) step(s, {});
    expect(getCell(s.grid, bramble.x, bramble.y)).toBe(Cell.Block);
    // A root takes three blasts.
    const root = roots[0];
    const side = openSides(s, root)[0] ?? DIRS.map((d) => ({ x: root.x + DIR_VEC[d].x, y: root.y + DIR_VEC[d].y })).find((q) => getCell(s.grid, q.x, q.y) !== Cell.Wall)!;
    for (let hit = 0; hit < 3; hit++) {
      s.flames.push({ x: side.x, y: side.y, part: 'center', dir: null, bombId: 900 + hit, ownerId: 'p1', bornTick: s.tick + 1, untilTick: s.tick + 20, kind: 'normal' });
      step(s, {});
    }
    expect(root.state).toBe('broken');
    // Purify the others: brambles stay cut for good.
    for (const r of roots) r.state = 'broken';
    setCell(s.grid, bramble.x, bramble.y, Cell.Floor);
    bramble.state = 'cut';
    bramble.tick = s.tick;
    for (let i = 0; i < 700; i++) step(s, {});
    expect(getCell(s.grid, bramble.x, bramble.y)).toBe(Cell.Floor);
  });

  it('dry grass catches fire, spreads tuft to tuft, kills, and burns out', () => {
    const s = reach(6);
    const tufts = props(s, 6, 'grass');
    expect(tufts.length).toBeGreaterThanOrEqual(2);
    const a = tufts.find((t) => tufts.some((u) => Math.abs(u.x - t.x) + Math.abs(u.y - t.y) === 1))!;
    const b = tufts.find((u) => Math.abs(u.x - a.x) + Math.abs(u.y - a.y) === 1)!;
    const victim = s.players[1];
    victim.hearts = 1; // the last heart
    victim.x = victim.px = b.x;
    victim.y = victim.py = b.y;
    s.players[0].invulnUntil = 1e9;
    s.flames.push({ x: a.x, y: a.y, part: 'center', dir: null, bombId: 77, ownerId: 'p1', bornTick: s.tick, untilTick: s.tick + 10, kind: 'normal' });
    step(s, {});
    expect(a.state).toBe('burning');
    for (let i = 0; i < 25; i++) step(s, {});
    expect(b.state).toBe('burning');
    expect(victim.alive).toBe(false);
    for (let i = 0; i < 80; i++) step(s, {});
    expect(a.state).toBe('burnt');
  });

  it('falling into the chasm is fatal (a jump still clears one cell)', () => {
    const s = reach(3);
    const r = region(s, 3);
    let pit: { x: number; y: number } | null = null;
    for (let y = r.cy * 14; y < r.cy * 14 + 14 && !pit; y++)
      for (let x = r.cx * 16; x < r.cx * 16 + 16 && !pit; x++) if (getCell(s.grid, x, y) === Cell.Chasm && openSides(s, { x, y }).length) pit = { x, y };
    const bank = openSides(s, pit!)[0];
    const p = s.players[0];
    p.x = p.px = bank.x;
    p.y = p.py = bank.y;
    const dir = DIRS.find((d) => bank.x + DIR_VEC[d].x === pit!.x && bank.y + DIR_VEC[d].y === pit!.y)!;
    for (let i = 0; i < 30; i++) step(s, { p1: { move: dir, bomb: false, ability: false } });
    expect(p.alive).toBe(true); // can't walk in
    setCell(s.grid, pit!.x, pit!.y, Cell.Chasm);
    p.x = p.px = pit!.x;
    p.y = p.py = pit!.y; // dropped in (e.g. pushed)
    step(s, {});
    expect(p.alive).toBe(false);
  });
});

describe('endless adventure: M5 arcs, variants and shapes', () => {
  it('arcs of 5–7 regions: a dominant biome, a transition, then the Guardian Chamber; biomes take turns', () => {
    for (const seed of [1, 7, 99]) {
      expect(arcInfo(seed, 0)).toMatchObject({ start: 0, length: 5, biome: 'volcanic', variant: 'normal' });
      for (let k = 0; k < 30; k++) {
        const a = arcInfo(seed, k);
        expect(a.length).toBeGreaterThanOrEqual(5);
        expect(a.length).toBeLessThanOrEqual(k ? 8 : 5);
        expect(arcInfo(seed, k + 1).start).toBe(a.start + a.length);
        expect(a.biome).toBe(k % 2 ? 'forest' : 'volcanic');
        for (let i = a.start; i < a.start + a.length; i++) {
          const info = regionInfo(seed, i);
          expect(arcOfRegion(seed, i).arc.index).toBe(k);
          expect(info.arc).toBe(k);
          expect(info.arcEnd).toBe(i === a.start + a.length - 1);
          expect(info.objective === 'boss').toBe(info.arcEnd);
          expect(info.bossNext).toBe(i === a.start + a.length - 2);
          if (i >= 5) expect(info.biome).toBe(info.bossNext ? 'transition' : a.biome);
          expect(info.variant).toBe(a.variant);
        }
      }
    }
  });

  it('each lap of the biome cycle comes back with a new mood; the two arcs of a lap differ', () => {
    const seen = new Set<string>();
    for (let k = 0; k < 40; k++) {
      const a = arcInfo(5, k);
      if (k < 2) expect(a.variant).toBe('normal');
      else {
        expect(a.variant).not.toBe('normal');
        expect(a.variant).not.toBe(arcInfo(5, k - 1).variant);
        expect(a.name.length).toBeGreaterThan(a.name.split(' ')[0].length);
      }
      seen.add(a.variant);
    }
    expect(seen).toEqual(new Set(['normal', 'night', 'mist', 'corrupted']));
    // Within three laps every biome meets every mood.
    const combos = new Set(Array.from({ length: 6 }, (_, i) => `${arcInfo(5, i + 2).biome}:${arcInfo(5, i + 2).variant}`));
    expect(combos.size).toBe(6);
  });

  it('arc rhythm: a breather at the start of an arc, one more Magmito before the chamber', () => {
    const a = arcInfo(3, 4);
    expect(regionDifficulty(3, a.start).enemies).toBeLessThanOrEqual(difficulty(a.start).enemies);
    const last = a.start + a.length - 2;
    expect(regionDifficulty(3, last).enemies).toBeGreaterThanOrEqual(difficulty(last).enemies);
    for (let d = 0; d < 300; d++) expect(regionDifficulty(3, d).enemies).toBeLessThanOrEqual(ADVENTURE.enemiesCap);
  });

  it('new shapes show up: ring, twin islands and long bridges, each cut by the biome pit', () => {
    const shapes = new Map<string, number>();
    for (let seed = 1; seed <= 30; seed++) for (let id = 5; id < 30; id++) shapes.set(regionMods(seed, id).shape, (shapes.get(regionMods(seed, id).shape) ?? 0) + 1);
    for (const k of ['island', 'plaza', 'ring', 'twin', 'longbridge', 'river', 'causeway']) expect(shapes.get(k) ?? 0, k).toBeGreaterThan(5);
    // Walk one seed deep and check the pits of each new shape.
    const found = new Set<string>();
    for (let seed = 1; seed <= 12 && found.size < 3; seed++) {
      const s = make(seed, 1);
      for (let id = 0; id < 20; id++) {
        const shape = regionMods(seed, id).shape;
        if (shape === 'ring' || shape === 'twin' || shape === 'longbridge') {
          const r = region(s, id);
          const pitKind = r.biome === 'volcanic' ? Cell.Lava : Cell.Chasm;
          let pits = 0;
          for (let y = r.cy * 14; y < r.cy * 14 + 14; y++) for (let x = r.cx * 16; x < r.cx * 16 + 16; x++) if (getCell(s.grid, x, y) === pitKind) pits++;
          expect(pits, `seed ${seed} region ${id} ${shape}`).toBeGreaterThan(shape === 'ring' ? 8 : 12);
          found.add(shape);
        }
        complete(s, id);
        walkThrough(s, id);
      }
    }
    expect(found).toEqual(new Set(['ring', 'twin', 'longbridge']));
  });

  it('regions carry their arc and variant; the journey remembers them', () => {
    const s = make(21, 1);
    for (let id = 0; id < 14; id++) {
      complete(s, id);
      walkThrough(s, id);
    }
    const r = region(s, 14);
    const info = regionInfo(21, 14);
    expect(r).toMatchObject({ arc: info.arc, variant: info.variant, arcEnd: info.arcEnd });
    expect(s.adventure!.journey.map((j) => j.arc)).toEqual(Array.from({ length: 15 }, (_, i) => regionInfo(21, i).arc));
  });
});

describe('endless adventure: B1 Guardian Chambers', () => {
  /** Walks the group into region `target` (the chamber when it is the arc's last region). */
  const into = (target: number, seed = 3, players = 2) => {
    const s = make(seed, players);
    for (let id = 0; id < target; id++) {
      complete(s, id);
      walkThrough(s, id);
    }
    return s;
  };
  const flameOn = (s: GameState, x: number, y: number, ownerId = 'p1') =>
    s.flames.push({ x, y, part: 'center', dir: null, bombId: 999, ownerId, bornTick: s.tick, untilTick: s.tick + 30, kind: 'normal' });

  it('every arc ends in a chamber: an open hall with the boss bed clear and two Totems of Return', () => {
    for (const seed of [3, 8, 21]) {
      const s = make(seed, 1);
      for (let id = 0; id < 20; id++) {
        const r = region(s, id);
        if (r.objective.kind === 'boss') {
          expect(regionMods(seed, id).shape).toBe('arena');
          const c = chamberCenter(r);
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) expect(getCell(s.grid, c.x + dx, c.y + dy), `seed ${seed} region ${id}`).toBe(Cell.Floor);
          const totems = s.adventure!.props.filter((p) => p.region === id && p.kind === 'totem');
          expect(totems).toHaveLength(2);
          for (const t of totems) expect(getCell(s.grid, t.x, t.y)).toBe(Cell.Wall);
          expect(s.enemies.filter((e) => e.alive && e.regionId === id)).toHaveLength(0);
        }
        complete(s, id);
        walkThrough(s, id);
      }
    }
    expect(regionInfo(3, 4).objective).toBe('boss');
    expect(regionInfo(3, 3).bossNext).toBe(true);
  });

  it('the boss wakes once the group is in, never leaves its chamber, and opens the way when it falls', () => {
    const s = into(3);
    // Still outside: nothing awake yet.
    expect(s.boss).toBeNull();
    complete(s, 3);
    walkThrough(s, 3);
    const b = s.boss!;
    expect(b).toMatchObject({ kind: 'golem', regionId: 4, level: 0 });
    expect(b.hp).toBe(Math.round(BOSSES.golem.hp * 1.5 * 0.8 * 1.2));
    for (const p of s.players) p.invulnUntil = 1e9;
    for (let i = 0; i < 60 * 50; i++) {
      step(s, {});
      if (!s.boss) break;
      const bx = Math.round(s.boss.x);
      const by = Math.round(s.boss.y);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          expect(regionAt(s, bx + dx, by + dy)).toBe(4);
          expect(isPit(getCell(s.grid, bx + dx, by + dy))).toBe(false);
        }
    }
    expect(s.result).toBeNull();
    // The killing blow.
    const boss = s.boss!;
    boss.hp = 1;
    boss.plates = 0;
    boss.invulnUntil = 0;
    boss.frozenUntil = 0;
    flameOn(s, Math.round(boss.x), Math.round(boss.y));
    step(s, {});
    step(s, {});
    expect(boss.action).toBe('dead');
    expect(region(s, 4).cleared).toBe(true);
    const g = exitGate(s, 4);
    expect(g.open).toBe(true);
    expect(getCell(s.grid, g.x, g.y)).toBe(Cell.Floor);
  });

  it('a Totem of Return brings a fallen ally back, once per boss phase', () => {
    const s = into(4);
    const b = s.boss!;
    b.frozenUntil = 1e9; // keep it still for the test
    const [p1, p2] = s.players;
    p1.invulnUntil = 1e9;
    const totem = s.adventure!.props.find((p) => p.region === 4 && p.kind === 'totem')!;
    const side = DIRS.map((d) => ({ x: totem.x + DIR_VEC[d].x, y: totem.y + DIR_VEC[d].y })).find((c) => getCell(s.grid, c.x, c.y) === Cell.Floor)!;
    const blast = () => {
      spawnBomb(s, { ownerId: 'p1', x: side.x, y: side.y, range: 1 }).detonateTick = s.tick + 1;
      for (let i = 0; i < 3; i++) step(s, {});
    };
    p2.alive = false;
    blast();
    expect(p2.alive).toBe(true);
    expect(totem.state).toBe('used');
    for (let i = 0; i < 60; i++) step(s, {});
    p2.alive = false;
    blast();
    expect(p2.alive).toBe(false);
    // A new phase recharges it.
    b.frozenUntil = 0;
    b.invulnUntil = 0;
    b.hp = Math.floor(b.maxHp / 2) + 1;
    b.plates = 0;
    flameOn(s, Math.round(b.x), Math.round(b.y));
    step(s, {});
    expect(b.phase).toBe(1);
    expect(totem.state).toBe('idle');
  });

  it('bosses take turns by biome and come back stronger; bigger groups face more health', () => {
    expect(arcBoss(3, 0)).toEqual({ kind: 'golem', level: 0 });
    expect(arcBoss(3, 1)).toEqual({ kind: 'guardian', level: 0 });
    expect(arcBoss(3, 2)).toEqual({ kind: 'golem', level: 1 });
    expect(arcBoss(3, 5)).toEqual({ kind: 'guardian', level: 2 });
    const solo = into(4, 3, 1).boss!;
    const four = into(4, 3, 4).boss!;
    expect(four.maxHp).toBeGreaterThan(solo.maxHp * 2);
  });
});

describe('endless adventure: B2 the reworked Golem', () => {
  const into = (target: number, seed = 3, players = 2) => {
    const s = make(seed, players);
    for (let id = 0; id < target; id++) {
      complete(s, id);
      walkThrough(s, id);
    }
    return s;
  };
  /** A golem chamber with the boss frozen in place and the players safe. */
  const chamber = () => {
    const s = into(4);
    const b = s.boss!;
    expect(b.kind).toBe('golem');
    b.frozenUntil = 1e9;
    for (const p of s.players) p.invulnUntil = 1e9;
    return { s, b };
  };
  const blast = (s: GameState, x: number, y: number, dir: 'up' | 'down' | 'left' | 'right' | null = null) =>
    s.flames.push({ x, y, part: dir ? 'arm' : 'center', dir, bombId: 999, ownerId: 'p1', bornTick: s.tick, untilTick: s.tick + 30, kind: 'normal' });
  const events = (s: GameState, n: number) => {
    const out: GameState['events'] = [];
    for (let i = 0; i < n; i++) {
      step(s, {});
      out.push(...s.events);
    }
    return out;
  };

  it('wears four plates: a blast on an armored side breaks that plate, a bare side takes the hit', () => {
    const { s, b } = chamber();
    expect(b.plates).toBe(ALL_PLATES);
    b.facing = 'down';
    const hp = b.hp;
    // A blast coming in from the west hits its right side (it faces south).
    blast(s, b.x - 1, b.y, 'right');
    const ev = events(s, 1);
    expect(ev.find((e) => e.type === 'bossPlate')).toMatchObject({ side: 1, dir: 'left' });
    expect(b.plates).toBe(ALL_PLATES & ~2);
    expect(b.hp).toBe(hp);
    expect(bodySide('down', 'left')).toBe(1);
    expect(bodySide('up', 'up')).toBe(0);
    // Same side once the hit cooldown is over: now it hurts.
    events(s, 60);
    blast(s, b.x - 1, b.y, 'right');
    events(s, 1);
    expect(b.hp).toBe(hp - 1);
    expect(b.plates).toBe(ALL_PLATES & ~2);
  });

  it('ramming a wall leaves it stunned with the core open: hits count double through the armor', () => {
    const { s, b } = chamber();
    b.frozenUntil = 0;
    for (const p of s.players) {
      p.x = p.px = b.arena!.x1 - 1;
      p.y = p.py = b.arena!.y1 - 1;
    }
    // Right against the west rim, charging into it.
    b.x = b.px = b.tx = b.arena!.x0 + 1;
    b.y = b.py = b.ty = b.arena!.y0 + 5;
    b.action = 'charge';
    b.chargeDir = 'left';
    const ev = events(s, 2);
    expect(b.action).toBe('stunned');
    expect(ev.some((e) => e.type === 'bossCore')).toBe(true);
    const hp = b.hp;
    b.invulnUntil = 0;
    blast(s, b.x, b.y + 1, 'up');
    const hit = events(s, 1).find((e) => e.type === 'bossHit');
    expect(hit).toMatchObject({ core: true });
    expect(b.hp).toBe(hp - 2);
    expect(b.plates).toBe(ALL_PLATES);
  });

  it('three phases; at the second the lava rises from the edges (warned first) and cools when it falls', () => {
    const { s, b } = chamber();
    const [p1, p2] = s.players;
    const ring = lavaRing(s, b);
    expect(ring.length).toBeGreaterThan(20);
    for (const c of ring) expect(regionAt(s, c.x, c.y)).toBe(4);
    // P2 stands on the edge, P1 well inside.
    p2.x = p2.px = ring[0].x;
    p2.y = p2.py = ring[0].y;
    p1.x = p1.px = b.arena!.x0 + 3;
    p1.y = p1.py = b.arena!.y0 + 2;
    b.plates = 0;
    b.invulnUntil = 0;
    b.hp = Math.floor(b.maxHp * 0.66);
    blast(s, b.x, b.y, null);
    const ev = events(s, 1);
    expect(b.phase).toBe(1);
    expect(ev.some((e) => e.type === 'lavaRising')).toBe(true);
    // The front and back plates come back with the new phase.
    expect(b.plates).toBe(1 | 4);
    expect(getCell(s.grid, ring[0].x, ring[0].y)).not.toBe(Cell.Lava);
    const later = events(s, 60 * 3);
    expect(later.some((e) => e.type === 'lavaRose')).toBe(true);
    for (const c of ring) expect(isPit(getCell(s.grid, c.x, c.y))).toBe(true);
    expect(p2.alive).toBe(false);
    expect(p1.alive).toBe(true);
    // The boss falls: its lava cools into floor again.
    b.hp = 1;
    b.plates = 0;
    b.invulnUntil = 0;
    blast(s, b.x, b.y, null);
    const end = events(s, 2);
    expect(b.action).toBe('dead');
    expect(end.some((e) => e.type === 'lavaCooled')).toBe(true);
    for (const c of ring) expect(getCell(s.grid, c.x, c.y)).toBe(Cell.Floor);
  });

  it('in its last phase it leaps onto the players (untouchable in the air) and cracks the floor', () => {
    const { s, b } = chamber();
    b.frozenUntil = 0;
    b.phase = 2;
    b.enraged = true;
    const p1 = s.players[0];
    p1.x = p1.px = b.arena!.x0 + 3;
    p1.y = p1.py = b.arena!.y0 + 3;
    let leapt = false;
    for (let i = 0; i < 60 * 40 && !leapt; i++) {
      step(s, {});
      if (b.action === 'leaping') leapt = true;
    }
    expect(leapt).toBe(true);
    const [spot, ...cells] = b.targets;
    expect(cells).toEqual(leapCells(s, b, spot));
    expect(b.invulnUntil).toBeGreaterThanOrEqual(b.actionUntil);
    while (b.action === 'leaping') step(s, {});
    expect({ x: b.x, y: b.y }).toEqual(spot);
    expect(s.flames.some((f) => f.ownerId === 'boss' && cells.some((c) => c.x === f.x && c.y === f.y))).toBe(true);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect(regionAt(s, spot.x + dx, spot.y + dy)).toBe(4);
  });

  it('the classic golem (classicBosses) has no plates and no lava', () => {
    const s = make(3, 1);
    s.config.classicBosses = true;
    spawnBoss(s, 'golem');
    expect(s.boss!.plates).toBeUndefined();
    expect(lavaRing(s, s.boss!)).toEqual([]);
  });
});

describe('endless adventure: B3 the reworked Guardian', () => {
  const SEED = 3;
  /** The first forest chamber (arc 1's guardian). */
  const chamberId = (() => {
    for (let id = 0; id < 40; id++) {
      const info = regionInfo(SEED, id);
      if (info.objective === 'boss' && arcBoss(SEED, info.arc).kind === 'guardian') return id;
    }
    throw new Error('no guardian chamber');
  })();
  const into = () => {
    const s = make(SEED, 2);
    for (let id = 0; id < chamberId; id++) {
      complete(s, id);
      walkThrough(s, id);
    }
    for (const p of s.players) p.invulnUntil = 1e9;
    return s;
  };
  const roots = (s: GameState) => s.adventure!.props.filter((p) => p.region === chamberId && p.kind === 'root');
  const brambles = (s: GameState) => s.adventure!.props.filter((p) => p.region === chamberId && p.kind === 'bramble');
  const events = (s: GameState, n: number) => {
    const out: GameState['events'] = [];
    for (let i = 0; i < n; i++) {
      step(s, {});
      out.push(...s.events);
    }
    return out;
  };
  const uproot = (s: GameState) => {
    for (const r of roots(s)) {
      r.state = 'broken';
      setCell(s.grid, r.x, r.y, Cell.Floor);
    }
  };

  it('its hall has three support roots spread apart and brambles; it wakes rooted', () => {
    const s = into();
    const rs = roots(s);
    expect(rs).toHaveLength(3);
    for (const r of rs) {
      expect(getCell(s.grid, r.x, r.y)).toBe(Cell.Wall);
      expect(r.state).toBe('intact');
      for (const q of rs) if (q !== r) expect(Math.abs(q.x - r.x) + Math.abs(q.y - r.y)).toBeGreaterThanOrEqual(6);
    }
    expect(brambles(s).length).toBeGreaterThan(0);
    const b = s.boss!;
    expect(b).toMatchObject({ kind: 'guardian', regionId: chamberId, rooted: true });
  });

  it('rooted, it never moves or dives, and heals while a root stands', () => {
    const s = into();
    const b = s.boss!;
    const start = { x: b.x, y: b.y };
    let dove = false;
    for (let i = 0; i < 60 * 15; i++) {
      step(s, {});
      if (b.action === 'burrowed' || b.attack === 'burrow') dove = true;
      expect({ x: b.x, y: b.y }).toEqual(start);
    }
    expect(dove).toBe(false);
    b.hp = b.maxHp - 3;
    b.lastHitTick = -999;
    const ev = events(s, 60 * 6);
    expect(ev.some((e) => e.type === 'bossRegen')).toBe(true);
    expect(b.hp).toBeGreaterThan(b.maxHp - 3);
  });

  it('blasting the roots breaks them; with the last one gone it tears loose and starts to roam', () => {
    const s = into();
    const b = s.boss!;
    const first = roots(s)[0];
    const side = DIRS.map((d) => ({ x: first.x + DIR_VEC[d].x, y: first.y + DIR_VEC[d].y })).find((c) => getCell(s.grid, c.x, c.y) === Cell.Floor)!;
    for (let i = 0; i < 3; i++) {
      spawnBomb(s, { ownerId: 'p1', x: side.x, y: side.y, range: 1 }).detonateTick = s.tick + 1;
      events(s, 40);
    }
    expect(first.state).toBe('broken');
    expect(b.rooted).toBe(true);
    uproot(s);
    const ev = events(s, 1);
    expect(ev.some((e) => e.type === 'bossUprooted')).toBe(true);
    expect(b.rooted).toBe(false);
    expect(b.action).toBe('stunned');
    expect(b.enraged).toBe(true);
    const start = { x: b.x, y: b.y };
    let moved = false;
    for (let i = 0; i < 60 * 15 && !moved; i++) {
      step(s, {});
      if (b.x !== start.x || b.y !== start.y) moved = true;
    }
    expect(moved).toBe(true);
    // Its last breath (35%) is the final phase.
    b.hp = Math.floor(b.maxHp * 0.35);
    b.invulnUntil = 0;
    b.frozenUntil = 0;
    if (b.action === 'burrowed') b.action = 'walk';
    s.flames.push({ x: Math.round(b.x), y: Math.round(b.y), part: 'center', dir: null, bombId: 999, ownerId: 'p1', bornTick: s.tick, untilTick: s.tick + 30, kind: 'normal' });
    const phase = events(s, 1).find((e) => e.type === 'bossPhase');
    expect(phase).toMatchObject({ phase: 1, last: true });
  });

  it('when it falls the brambles wither for good', () => {
    const s = into();
    const b = s.boss!;
    uproot(s);
    events(s, 2);
    b.hp = 1;
    b.invulnUntil = 0;
    b.frozenUntil = 0;
    b.action = 'walk';
    s.flames.push({ x: Math.round(b.x), y: Math.round(b.y), part: 'center', dir: null, bombId: 999, ownerId: 'p1', bornTick: s.tick, untilTick: s.tick + 30, kind: 'normal' });
    const ev = events(s, 2);
    expect(b.action).toBe('dead');
    expect(ev.some((e) => e.type === 'bramblesWithered')).toBe(true);
    events(s, 60 * 20);
    for (const p of brambles(s)) {
      expect(p.state).toBe('cut');
      expect(getCell(s.grid, p.x, p.y)).not.toBe(Cell.Block);
    }
  });
});

describe('endless adventure: B4 elites and the Mimic Chest', () => {
  /** A quiet start: region 0 with no Magmitos and an untouchable player. */
  const quiet = () => {
    const s = make(5);
    s.enemies = [];
    const p = s.players[0];
    p.invulnUntil = 1e9;
    return { s, p };
  };
  /** An open floor cell with open floor on both sides along x (and nothing on it). */
  const openRow = (s: GameState, len = 5) => {
    const g = s.grid;
    for (let y = g.y0 + 1; y < g.y0 + g.h - 1; y++)
      for (let x = g.x0 + 1; x < g.x0 + g.w - len; x++) {
        let ok = true;
        for (let k = 0; k < len && ok; k++) ok = getCell(g, x + k, y) === Cell.Floor && regionAt(s, x + k, y) === 0 && !s.adventure!.props.some((q) => q.x === x + k && q.y === y);
        if (ok) return { x, y };
      }
    throw new Error('no open row');
  };
  const blast = (s: GameState, x: number, y: number, id = 900) =>
    s.flames.push({ x, y, part: 'center', dir: null, bombId: id, ownerId: 'p1', bornTick: s.tick, untilTick: s.tick + 3, kind: 'normal' });
  const run = (s: GameState, n: number) => {
    const out: GameState['events'] = [];
    for (let i = 0; i < n; i++) {
      step(s, {});
      out.push(...s.events);
    }
    return out;
  };
  const mimicChest = (s: GameState, x: number, y: number) => {
    const pr = { id: 7777, kind: 'chest' as const, region: 0, x, y, state: 'closed' as const, mimic: true, tick: 0 };
    s.adventure!.props.push(pr);
    return s.adventure!.props[s.adventure!.props.length - 1];
  };

  it('elites only appear from the second arc on, one or two per region, never in a chamber', () => {
    const seed = 9;
    let seen = 0;
    for (let id = 0; id < 40; id++) {
      const info = regionInfo(seed, id);
      const el = elitesFor(seed, id);
      if (info.arc < 1 || info.objective === 'boss' || info.objective === 'camp' || id < 7) expect(el).toEqual([]);
      else {
        expect(el.length).toBeGreaterThanOrEqual(1);
        expect(el.length).toBeLessThanOrEqual(2);
        seen += el.length;
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('an elite Magmito takes three separate blasts', () => {
    const { s } = quiet();
    const c = openRow(s);
    const e = makeEnemy(s, 'magmite', c.x + 4, c.y, 0, { elite: true, hp: ELITE_MAGMITE_HP, frozenUntil: 1e9 });
    s.enemies.push(e);
    const hurt: number[] = [];
    for (let k = 0; k < 3; k++) {
      blast(s, e.x, e.y, 900 + k);
      const ev = run(s, 50);
      for (const x of ev) if (x.type === 'enemyHurt') hurt.push(x.hp);
      if (k < 2) expect(e.alive).toBe(true);
    }
    expect(hurt).toEqual([2, 1]);
    expect(e.alive).toBe(false);
  });

  it('an elite Fagulha splits in two when it dies (and the clear goal counts them)', () => {
    const { s } = quiet();
    const c = openRow(s);
    region(s, 0).objective.goal = 1;
    const e = makeEnemy(s, 'spark', c.x + 2, c.y, 0, { elite: true, mode: 'rest', modeUntil: 1e9 });
    s.enemies.push(e);
    blast(s, e.x, e.y);
    const ev = run(s, 1);
    expect(ev.some((x) => x.type === 'eliteSplit')).toBe(true);
    const kids = s.enemies.filter((x) => x.alive && x.kind === 'spark');
    expect(kids).toHaveLength(2);
    expect(kids.every((k) => !k.elite)).toBe(true);
    expect(region(s, 0).objective.goal).toBe(3);
    // The splitting blast spared them.
    run(s, 10);
    expect(s.enemies.filter((x) => x.alive && x.kind === 'spark')).toHaveLength(2);
  });

  it('some chests are Mimics from the second arc on, never in the first', () => {
    let mimics = 0;
    for (const seed of [1, 2, 3, 4]) {
      const s = make(seed);
      for (let id = 0; id < 26; id++) {
        syncAdventureWindow(s, [id, id + 1]);
        for (const p of s.adventure!.props) if (p.kind === 'chest' && p.mimic) {
          expect(regionInfo(seed, p.region).arc).toBeGreaterThanOrEqual(1);
          mimics++;
        }
        s.adventure!.props = s.adventure!.props.filter((p) => !p.mimic);
      }
    }
    expect(mimics).toBeGreaterThan(0);
  });

  it('opening a Mimic: it bites a shield off, wakes harmless for a moment, then hunts', () => {
    const { s, p } = quiet();
    const c = openRow(s);
    const pr = mimicChest(s, c.x + 2, c.y);
    p.invulnUntil = 0;
    p.shield = 1;
    p.x = p.px = pr.x;
    p.y = p.py = pr.y;
    const ev = run(s, 1);
    expect(ev.some((x) => x.type === 'mimicAwoke')).toBe(true);
    expect(ev.some((x) => x.type === 'mimicBite')).toBe(true);
    expect(p.shield).toBe(0);
    expect(pr.state).toBe('used');
    expect(ev.some((x) => x.type === 'chestOpened')).toBe(false);
    const m = s.enemies.find((x) => x.kind === 'mimic')!;
    expect(m).toMatchObject({ hp: MIMIC_HP, mode: 'reveal', propId: pr.id });
    // Standing on it during the reveal is safe…
    run(s, 30);
    expect(p.alive).toBe(true);
    p.invulnUntil = 1e9;
    run(s, 60);
    expect(m.mode).not.toBe('reveal');
  });

  it('it swallows a bomb and spits it back rolling toward the player', () => {
    const { s, p } = quiet();
    const c = openRow(s, 7);
    const pr = mimicChest(s, c.x + 3, c.y);
    blast(s, pr.x, pr.y); // a blast wakes it too (no bite)
    run(s, 1);
    const m = s.enemies.find((x) => x.kind === 'mimic')!;
    m.nextLeapTick = 1e9;
    p.x = p.px = c.x + 6;
    p.y = p.py = c.y;
    for (let i = 0; i < 120 && m.mode === 'reveal'; i++) step(s, {});
    // A bomb in its path, between it and the player.
    const b = spawnBomb(s, { ownerId: 'p1', x: Math.round(m.x) + 2, y: Math.round(m.y), range: 2 });
    b.detonateTick = s.tick + 1000;
    const ev = run(s, 200);
    expect(ev.some((x) => x.type === 'mimicSwallow')).toBe(true);
    expect(ev.some((x) => x.type === 'mimicSpit')).toBe(true);
    expect(s.bombs.some((x) => x.id === b.id)).toBe(false);
  });

  it('it crouches, then leaps onto the player out of reach of blasts', () => {
    const { s, p } = quiet();
    const c = openRow(s, 6);
    const pr = mimicChest(s, c.x, c.y);
    blast(s, pr.x, pr.y);
    run(s, 1);
    const m = s.enemies.find((x) => x.kind === 'mimic')!;
    p.x = p.px = c.x + 5;
    p.y = p.py = c.y;
    for (let i = 0; i < 120 && m.mode === 'reveal'; i++) step(s, {});
    m.hurtUntil = 0;
    m.nextLeapTick = 0;
    let crouch: { tx: number; ty: number } | null = null;
    for (let i = 0; i < 400 && !crouch; i++) {
      step(s, {});
      const e = s.events.find((x) => x.type === 'mimicCrouch');
      if (e && e.type === 'mimicCrouch') crouch = e;
      p.x = p.px = c.x + 5; // hold still
    }
    expect(crouch).not.toBeNull();
    for (let i = 0; i < 60 && m.mode !== 'leap'; i++) step(s, {});
    expect(m.mode).toBe('leap');
    const hp = m.hp;
    blast(s, Math.round(m.x), Math.round(m.y));
    const ev = run(s, 60);
    expect(m.hp).toBe(hp);
    const land = ev.find((x) => x.type === 'mimicLand');
    expect(land).toMatchObject({ x: crouch!.tx, y: crouch!.ty });
  });

  it('beaten, it leaves a double chest where it fell', () => {
    const { s, p } = quiet();
    const c = openRow(s);
    const pr = mimicChest(s, c.x + 2, c.y);
    blast(s, pr.x, pr.y);
    run(s, 1);
    const m = s.enemies.find((x) => x.kind === 'mimic')!;
    m.mode = 'hunt';
    m.nextLeapTick = 1e9;
    m.hp = 1;
    m.hurtUntil = 0;
    m.frozenUntil = 1e9;
    blast(s, Math.round(m.x), Math.round(m.y));
    const ev = run(s, 1);
    expect(m.alive).toBe(false);
    expect(ev.some((x) => x.type === 'mimicDefeated')).toBe(true);
    expect(pr).toMatchObject({ state: 'closed', hp: 2 });
    run(s, 10);
    const before = s.powerups.length;
    p.x = p.px = pr.x;
    p.y = p.py = pr.y;
    const opened = run(s, 1);
    expect(opened.some((x) => x.type === 'chestOpened')).toBe(true);
    expect(s.enemies.filter((x) => x.kind === 'mimic')).toHaveLength(1);
    expect(s.powerups.length + (opened.filter((x) => x.type === 'powerupCollected').length) - before).toBeGreaterThanOrEqual(3);
  });
});

describe('endless adventure: B5 the boss comes back with the arc variant', () => {
  it('a chamber in a night / mist / corrupted arc wakes a boss with that twist, stronger every lap', () => {
    const SEED = 3;
    let id = 0;
    for (; id < 60; id++) {
      const info = regionInfo(SEED, id);
      if (info.objective === 'boss' && info.variant !== 'normal') break;
    }
    const info = regionInfo(SEED, id);
    const s = make(SEED, 1);
    for (let k = 0; k < id; k++) {
      complete(s, k);
      walkThrough(s, k);
    }
    for (let i = 0; i < 120 && !s.boss; i++) step(s, {});
    expect(s.boss).toMatchObject({ regionId: id, mod: info.variant, reworked: true });
    expect(s.boss!.level).toBeGreaterThanOrEqual(1);
  });
});

describe('Task 3 · A1: camps, the expedition purse and falling back', () => {
  const SEED = 3;
  /** Walk a group up to region `id` (every region before it completed). */
  const to = (id: number, players = 2) => {
    const s = make(SEED, players);
    for (let k = 0; k < id; k++) {
      complete(s, k);
      walkThrough(s, k);
    }
    return s;
  };
  const fire = (s: GameState, id: number) => s.adventure!.props.find((p) => p.region === id && p.kind === 'campfire')!;
  const gather = (s: GameState, id: number) => {
    const f = fire(s, id);
    s.players.forEach((p, i) => {
      if (!p.alive) return;
      p.x = p.px = f.x + (i % 2 ? 2 : -2);
      p.y = p.py = f.y;
    });
  };
  const chunkCells = (s: GameState, id: number) => {
    const r = s.adventure!.regions.find((x) => x.id === id)!;
    const out: number[] = [];
    for (let y = r.cy * ADVENTURE.chunkH; y < (r.cy + 1) * ADVENTURE.chunkH; y++)
      for (let x = r.cx * ADVENTURE.chunkW; x < (r.cx + 1) * ADVENTURE.chunkW; x++) out.push(getCell(s.grid, x, y));
    return out;
  };

  it('every arc after the first opens with a camp: a quiet clearing with a fire, the way on sealed', () => {
    for (let k = 1; k < 8; k++) {
      const a = arcInfo(SEED, k);
      expect(regionInfo(SEED, a.start).objective).toBe('camp');
      expect(regionInfo(SEED, a.start - 1).objective).toBe('boss');
    }
    expect(regionInfo(SEED, 5)).toMatchObject({ name: 'Pouso da Fogueira', objective: 'camp' });
    const s = to(5);
    expect(s.enemies.filter((e) => e.alive && e.regionId === 5)).toHaveLength(0);
    expect(fire(s, 5).state).toBe('unlit');
    expect(exitGate(s, 5).open).toBe(false);
  });

  it('the whole group at the fire lights it: saved, the way on opens and the fallen come back', () => {
    const s = to(5);
    s.players[1].alive = false;
    s.players[0].maxBombs = 4;
    gather(s, 5);
    step(s, {});
    const ev = s.events;
    expect(ev.some((e) => e.type === 'campLit')).toBe(true);
    expect(fire(s, 5).state).toBe('lit');
    expect(s.expedition).toMatchObject({ camp: 5, camps: 1 });
    expect(s.expedition!.snapshot.find((q) => q.slot === 0)!.maxBombs).toBe(4);
    expect(exitGate(s, 5).open).toBe(true);
    expect(s.players[1].alive).toBe(true);
  });

  it('regions crossed and chests fill the purse', () => {
    const s = make(SEED, 1);
    expect(s.expedition!.coins).toBe(0);
    complete(s, 0);
    expect(s.expedition!.coins).toBeGreaterThan(0);
    const before = s.expedition!.coins;
    const chest = s.adventure!.props.find((p) => p.kind === 'chest' && p.state === 'closed' && !p.mimic);
    if (chest) {
      s.players[0].x = s.players[0].px = chest.x;
      s.players[0].y = s.players[0].py = chest.y;
      step(s, {});
      expect(s.expedition!.coins).toBeGreaterThan(before);
    }
  });

  it('the whole group falls: a moment later they wake at the camp, same world, half the purse, heroes as saved', () => {
    const s = to(5);
    gather(s, 5);
    step(s, {});
    const saved = s.expedition!.snapshot.map((q) => ({ ...q }));
    const campCells = chunkCells(s, 5);
    complete(s, 5);
    walkThrough(s, 5);
    complete(s, 6);
    walkThrough(s, 6);
    s.expedition!.coins = 101;
    for (const p of s.players) {
      p.maxBombs = 8;
      p.alive = false;
    }
    step(s, {});
    expect(s.events.some((e) => e.type === 'groupFell')).toBe(true);
    expect(s.result).toBeNull();
    for (let i = 0; i < 60 * 3; i++) step(s, {});
    expect(s.result).toBeNull();
    expect(s.expedition).toMatchObject({ coins: 51, returns: 1, camp: 5 });
    for (const p of s.players) {
      expect(p.alive).toBe(true);
      expect(regionAt(s, p.x, p.y)).toBe(5);
      expect(p.maxBombs).toBe(saved.find((q) => q.slot === p.slot)!.maxBombs);
    }
    // Same camp, from the seed: the grid matches what it was (apart from the doorway sealed behind).
    const now = chunkCells(s, 5);
    const diff = now.filter((c, i) => c !== campCells[i]).length;
    expect(diff).toBeLessThanOrEqual(2);
    // They gather again and go on.
    gather(s, 5);
    step(s, {});
    expect(fire(s, 5).state).toBe('lit');
    expect(exitGate(s, 5).open).toBe(true);
  });

  it('ending the expedition at a lit fire keeps the purse (only next to the fire)', () => {
    const s = to(5, 1);
    gather(s, 5);
    step(s, {});
    s.expedition!.coins = 77;
    const p = s.players[0];
    p.x = p.px = fire(s, 5).x + 5;
    step(s, { p1: { move: null, bomb: false, ability: false, campEnd: true } });
    expect(s.result).toBeNull();
    p.x = p.px = fire(s, 5).x - 2;
    step(s, { p1: { move: null, bomb: false, ability: false, campEnd: true } });
    expect(s.result).toMatchObject({ outcome: 'victory', reason: 'expeditionEnded' });
    expect(s.expedition).toMatchObject({ ended: true, coins: 77 });
  });

  it('a saved expedition resumes at its camp: the same world, the purse and the heroes as saved', () => {
    const a = to(5);
    gather(a, 5);
    step(a, {});
    const save = { ...a.expedition!, coins: 40 };
    save.snapshot = save.snapshot.map((q) => ({ ...q, range: 5 }));
    const b = createGame({ ...a.config, expedition: save });
    expect(b.adventure!.regions.map((r) => r.id)).toEqual([5, 6]);
    expect(b.expedition).toMatchObject({ camp: 5, coins: 40 });
    for (const p of b.players) {
      expect(regionAt(b, p.x, p.y)).toBe(5);
      expect(p.range).toBe(5);
    }
    // Region 6 is the very same island.
    expect(chunkCells(b, 6)).toEqual(chunkCells(a, 6));
  });
});

describe('Task 3 · A2: the campfire vault', () => {
  it('coins put in the vault at a lit fire are safe when the group falls; ending keeps both', () => {
    const save = { camp: 5, coins: 0, snapshot: [], returns: 0, camps: 1, best: 5 };
    const s = createGame({ mode: 'adventure', seed: 3, width: 0, height: 0, players: [{ id: 'p1', slot: 0, characterId: 'bombito', name: 'P1' }], expedition: save });
    s.phase = 'playing';
    step(s, {});
    const fire = s.adventure!.props.find((p) => p.kind === 'campfire')!;
    expect(fire.state).toBe('lit');
    const p = s.players[0];
    // Away from the fire nothing happens.
    s.expedition!.coins = 80;
    p.x = p.px = fire.x - 6;
    step(s, { p1: { move: null, bomb: false, ability: false, campBank: true } });
    expect(s.expedition!.banked ?? 0).toBe(0);
    p.x = p.px = fire.x - 2;
    step(s, { p1: { move: null, bomb: false, ability: false, campBank: true } });
    expect(s.events.find((e) => e.type === 'coinsBanked')).toMatchObject({ amount: 80, banked: 80 });
    expect(s.expedition).toMatchObject({ coins: 0, banked: 80 });
    s.expedition!.coins = 20;
    p.alive = false;
    for (let i = 0; i < 60 * 3; i++) step(s, {});
    expect(s.expedition).toMatchObject({ coins: 10, banked: 80, returns: 1 });
  });
});

describe('Task 3: camps are safe', () => {
  it('enemies from the next region never wander into the camp through the open gate', () => {
    const save = { camp: 5, coins: 0, snapshot: [], returns: 0, camps: 1, best: 5 };
    const s = createGame({ mode: 'adventure', seed: 3, width: 0, height: 0, players: [{ id: 'p1', slot: 0, characterId: 'bombito', name: 'P1' }], expedition: save });
    s.phase = 'playing';
    s.players[0].invulnUntil = 1e9;
    // Every enemy of region 6 starts right at the open gate.
    step(s, {});
    const gate = exitGate(s, 5);
    expect(gate.open).toBe(true);
    const outside = DIRS.map((d) => ({ x: gate.x + DIR_VEC[d].x, y: gate.y + DIR_VEC[d].y })).find((c) => regionAt(s, c.x, c.y) === 6)!;
    for (const e of s.enemies) {
      e.x = e.px = e.tx = outside.x;
      e.y = e.py = e.ty = outside.y;
      e.dir = null;
    }
    for (let i = 0; i < 60 * 20; i++) {
      step(s, {});
      for (const e of s.enemies) if (e.alive) expect(regionAt(s, Math.round(e.x), Math.round(e.y))).not.toBe(5);
    }
  });
});

describe('Task 3 · A3: camp services and residents', () => {
  const at = (residents: string[] = [], coins = 500) => {
    const save = { camp: 5, coins, snapshot: [], returns: 0, camps: 1, best: 5 };
    const s = createGame({ mode: 'adventure', seed: 3, width: 0, height: 0, players: [{ id: 'p1', slot: 0, characterId: 'bombito', name: 'P1' }], expedition: save, residents });
    s.phase = 'playing';
    s.players[0].invulnUntil = 1e9;
    step(s, {});
    return s;
  };
  const act = (s: GameState, id: string) => {
    step(s, { p1: { move: null, bomb: false, ability: false, campAction: campActionIndex(id) } });
    return s.events.find((e) => e.type === 'campBought' || e.type === 'wheelSpun');
  };

  it('the camp has tents around the fire; residents come from the group and from rescues', () => {
    const s = at(['silvio', 'ninja']);
    const tents = s.adventure!.props.filter((p) => p.kind === 'tent' && p.region === 5);
    expect(tents.length).toBeGreaterThanOrEqual(4);
    for (const t of tents) expect(getCell(s.grid, t.x, t.y)).toBe(Cell.Wall);
    // Starters never "live" at the camp; rescued heroes do.
    expect(s.expedition!.residents).toEqual(['silvio']);
    addResident(s, 'bombiao');
    expect(s.events.some((e) => e.type === 'residentArrived')).toBe(true);
    expect(s.expedition!.residents).toEqual(['silvio', 'bombiao']);
  });

  it('a service needs its resident; buying spends the purse and applies right away', () => {
    const s = at([]);
    const p = s.players[0];
    expect(act(s, 'shop:bombUp')).toBeUndefined();
    addResident(s, 'silvio');
    const bombs = p.maxBombs;
    expect(act(s, 'shop:bombUp')).toMatchObject({ type: 'campBought', price: 30 });
    expect(p.maxBombs).toBe(bombs + 1);
    expect(s.expedition!.coins).toBe(470);
    // Not in the camp: closed.
    const r6 = s.adventure!.regions.find((r) => r.id === 6)!;
    p.x = p.px = r6.cx * ADVENTURE.chunkW + 7;
    p.y = p.py = r6.cy * ADVENTURE.chunkH + 7;
    expect(act(s, 'shop:fireUp')).toBeUndefined();
  });

  it('the smith and the cook work once per camp; not enough coins means no deal', () => {
    const s = at(['bombiao', 'bombzaga'], 140);
    const p = s.players[0];
    expect(act(s, 'smith:range')).toBeTruthy();
    expect(act(s, 'smith:bomb')).toBeUndefined();
    expect(s.expedition!.coins).toBe(30);
    expect(act(s, 'cook:feather')).toBeUndefined(); // 35 > 30
    expect(act(s, 'cook:shield')).toBeTruthy();
    expect(p.shield).toBe(1);
    expect(act(s, 'cook:speed')).toBeUndefined();
  });

  it('a Feather of Return shrugs off a lethal hit once', () => {
    const s = at(['silvio']);
    const p = s.players[0];
    act(s, 'shop:feather');
    expect(p.feather).toBe(1);
    p.hearts = 1; // the feather saves the last heart
    p.invulnUntil = 0;
    s.flames.push({ x: Math.round(p.x), y: Math.round(p.y), part: 'center', dir: null, bombId: 9, ownerId: 'meteor', bornTick: s.tick, untilTick: s.tick + 2, kind: 'normal' });
    step(s, {});
    expect(p.alive).toBe(true);
    expect(s.events.some((e) => e.type === 'featherSaved')).toBe(true);
    expect(p.feather).toBe(0);
  });

  it('the scout reveals the arc ahead; contracts pay on success and fail on a fall', () => {
    const s = at(['senha', 'reipelota']);
    act(s, 'scout');
    const next = arcInfo(3, 2).start;
    expect(s.expedition!.scoutTo).toBe(next);
    const r6 = s.adventure!.regions.find((r) => r.id === 6)!;
    const i = cellIndex(s.grid, r6.cx * ADVENTURE.chunkW + 7, r6.cy * ADVENTURE.chunkH + 7);
    for (let k = 0; k < 4; k++) step(s, {});
    expect(s.adventure!.explored[i]).toBe(1);
    act(s, 'contract:clean');
    expect(s.expedition!.contract).toMatchObject({ kind: 'clean', until: next });
    expect(act(s, 'contract:chests')).toBeUndefined(); // one contract at a time
    s.players[0].alive = false;
    for (let k = 0; k < 60 * 3; k++) step(s, {});
    expect(s.expedition!.contract).toBeNull();
  });

  it('heroes can be swapped at the camp: starters and residents only', () => {
    const s = at(['senha']);
    const p = s.players[0];
    expect(act(s, 'hero:tiringao')).toBeUndefined();
    expect(act(s, 'hero:senha')).toBeTruthy();
    expect(p.characterId).toBe('senha');
    expect(act(s, 'hero:ninja')).toBeTruthy();
    expect(p.characterId).toBe('ninja');
  });
});

describe('Task 3 · A4: hearts and relics', () => {
  const at = (relics: string[] = [], players = 1) => {
    const save = { camp: 5, coins: 100, snapshot: [], returns: 0, camps: 1, best: 5, relics };
    const s = createGame({ mode: 'adventure', seed: 3, width: 0, height: 0, players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, slot: i, characterId: 'bombito', name: `P${i + 1}` })), expedition: save });
    s.phase = 'playing';
    step(s, {});
    return s;
  };
  const burn = (s: GameState, p: GameState['players'][number]) => {
    p.invulnUntil = 0;
    s.flames.push({ x: Math.round(p.x), y: Math.round(p.y), part: 'center', dir: null, bombId: 9, ownerId: 'meteor', bornTick: s.tick, untilTick: s.tick + 2, kind: 'normal' });
    step(s, {});
  };

  it('three hearts in the Adventure: a hit takes one, the third is a fall; the camp fills them back', () => {
    const s = at();
    const p = s.players[0];
    expect(p).toMatchObject({ hearts: 3, maxHearts: 3 });
    burn(s, p);
    expect(p).toMatchObject({ alive: true, hearts: 2 });
    expect(s.events.some((e) => e.type === 'heartLost')).toBe(true);
    burn(s, p);
    expect(p.hearts).toBe(1);
    // Relighting the camp's fire (back after a fall) fills the hearts.
    burn(s, p);
    expect(p.alive).toBe(false);
    for (let i = 0; i < 60 * 3; i++) step(s, {});
    expect(p).toMatchObject({ alive: true, hearts: 3 });
  });

  it('Versus and Boss Rush keep the single hit', () => {
    const s = createGame({ mode: 'bossrush', seed: 3, width: 0, height: 0, players: [{ id: 'p1', slot: 0, characterId: 'bombito', name: 'P1' }] });
    expect(s.players[0].hearts).toBeUndefined();
  });

  it('relics: found once each, and they work', () => {
    const s = at();
    expect(grantRelic(s, 0, 0)).toBeTruthy();
    expect(s.events.some((e) => e.type === 'relicFound')).toBe(true);
    for (let i = 0; i < 10; i++) grantRelic(s, 0, 0);
    expect(new Set(s.expedition!.relics).size).toBe(RELIC_IDS.length);
    expect(s.expedition!.relics!.length).toBe(RELIC_IDS.length);
    // Ímã de moedas: +25%.
    const before = s.expedition!.coins;
    addCoins(s, 40, 0, 0);
    expect(s.expedition!.coins - before).toBe(50);
  });

  it('Coração de Magma: the first fall of the arc puts you back on solid ground', () => {
    const s = at(['magma_heart']);
    const p = s.players[0];
    // Dig a lava cell next to the player and walk them into it.
    const x = Math.round(p.x);
    const y = Math.round(p.y);
    setCell(s.grid, x, y, Cell.Lava);
    step(s, {});
    expect(p.alive).toBe(true);
    expect(s.events.some((e) => e.type === 'relicSaved')).toBe(true);
    expect(getCell(s.grid, Math.round(p.x), Math.round(p.y))).not.toBe(Cell.Lava);
    // Only once per arc.
    setCell(s.grid, Math.round(p.x), Math.round(p.y), Cell.Lava);
    p.invulnUntil = 0;
    step(s, {});
    expect(p.alive).toBe(false);
  });

  it('Pavio Duplo: every fifth bomb reaches one cell further', () => {
    const s = at(['double_fuse']);
    const p = s.players[0];
    p.maxBombs = 8;
    const ranges: number[] = [];
    for (let i = 0; i < 5; i++) {
      p.x = p.px = Math.round(p.x);
      step(s, { p1: { move: null, bomb: true, ability: false } });
      const b = s.bombs[s.bombs.length - 1];
      ranges.push(b.range);
      s.bombs.pop();
      step(s, {});
    }
    expect(ranges[4]).toBe(p.range + 1);
    expect(ranges.slice(0, 4).every((r) => r === p.range)).toBe(true);
  });
});
