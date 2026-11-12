import { ADVENTURE, Cell, DIR_VEC, DIRS, RULES, secToTicks, type BiomeId } from '@4walls/shared';
import { cellIndex, createGrid, getCell, setCell } from './grid';
import { nextRandom, randInt } from './rng';
import type { AdventureState, EnemyState, GameState, GateState, Grid, RegionState } from './types';
import { bombAt, flamesAt, mineAt, newId } from './world';

/**
 * Adventure mode world: regions laid out along a random walk on a chunk lattice (so the world is
 * never a plain rectangle), each region an organic island with a pillar grid and crates, joined by
 * sealed gates. Clearing a region's Magmitos opens the gate to the next one; fog of war covers
 * what is still locked or unexplored.
 */

const REGION_NAMES = ['Caldeira Rasa', 'Campos de Cinza', 'Rio de Magma', 'Ponte de Obsidiana', 'Bosque Chamuscado', 'Clareira Encantada', 'Ruínas Musgosas'];

export interface AdventureBuild {
  grid: Grid;
  adventure: AdventureState;
  spawns: { x: number; y: number }[];
}

type Dir4 = 'E' | 'N' | 'S';
const STEP: Record<Dir4, [number, number]> = { E: [1, 0], N: [0, -1], S: [0, 1] };

function biomeFor(i: number, n: number): BiomeId {
  if (n >= 3 && i === n - 1) return 'forest';
  if (n >= 3 && i === n - 2) return 'transition';
  return 'volcanic';
}

export function buildAdventure(rngHolder: { rng: number }, regionCount: number = ADVENTURE.regions): AdventureBuild {
  const CW = ADVENTURE.chunkW;
  const CH = ADVENTURE.chunkH;
  const n = Math.max(2, Math.min(regionCount, REGION_NAMES.length));

  // 1. Region path: east-leaning random walk, never revisiting a chunk.
  const path: { cx: number; cy: number; dirToNext: Dir4 | null }[] = [{ cx: 0, cy: 0, dirToNext: null }];
  const seen = new Set(['0,0']);
  for (let i = 1; i < n; i++) {
    const prev = path[i - 1];
    const options = (['E', 'E', 'E', 'N', 'S'] as Dir4[]).filter((d) => !seen.has(`${prev.cx + STEP[d][0]},${prev.cy + STEP[d][1]}`));
    // Avoid two vertical steps in a row so the world keeps moving forward.
    const lastVertical = i > 1 && path[i - 2].dirToNext !== 'E';
    const pool = lastVertical ? options.filter((d) => d === 'E') : options;
    const d = (pool.length ? pool : (['E'] as Dir4[]))[randInt(rngHolder, pool.length || 1)];
    prev.dirToNext = d;
    const next = { cx: prev.cx + STEP[d][0], cy: prev.cy + STEP[d][1], dirToNext: null };
    seen.add(`${next.cx},${next.cy}`);
    path.push(next);
  }
  const minCy = Math.min(...path.map((p) => p.cy));
  for (const p of path) p.cy -= minCy;
  const maxCx = Math.max(...path.map((p) => p.cx));
  const maxCy = Math.max(...path.map((p) => p.cy));

  // 2. Grid: everything starts as void (wall); islands are carved into it.
  const W = (maxCx + 1) * CW;
  const H = (maxCy + 1) * CH;
  const grid = createGrid(W, H);
  grid.cells.fill(Cell.Wall);
  const regionOf = new Int16Array(W * H).fill(-1);
  const corridor = new Set<number>();
  const regions: RegionState[] = [];
  const gates: GateState[] = [];

  const center = (i: number) => ({ x: path[i].cx * CW + 7, y: path[i].cy * CH + 7 });
  const edgeCell = (i: number, d: Dir4 | 'W'): { x: number; y: number } => {
    const ox = path[i].cx * CW;
    const oy = path[i].cy * CH;
    if (d === 'E') return { x: ox + CW - 1, y: oy + 7 };
    if (d === 'W') return { x: ox, y: oy + 7 };
    if (d === 'N') return { x: ox + 7, y: oy };
    return { x: ox + 7, y: oy + CH - 1 };
  };
  const opposite = (d: Dir4): Dir4 | 'W' => (d === 'E' ? 'W' : d === 'N' ? 'S' : 'N');

  for (let i = 0; i < n; i++) {
    const { cx, cy } = path[i];
    const ox = cx * CW;
    const oy = cy * CH;
    regions.push({ id: i, name: REGION_NAMES[i], biome: biomeFor(i, n), cx, cy, unlocked: i === 0, cleared: false });
    // Organic island: a noisy ellipse inside the chunk (1-cell margin).
    const p1 = nextRandom(rngHolder) * Math.PI * 2;
    const p2 = nextRandom(rngHolder) * Math.PI * 2;
    const rx = 6.5;
    const ry = 5.5;
    for (let y = oy; y < oy + CH; y++)
      for (let x = ox; x < ox + CW; x++) {
        regionOf[cellIndex(grid, x, y)] = i;
        if (x === ox || y === oy || x === ox + CW - 1 || y === oy + CH - 1) continue;
        const dx = (x + 0.5 - (ox + 8)) / rx;
        const dy = (y + 0.5 - (oy + 7)) / ry;
        const t = Math.atan2(dy, dx);
        const r = 1 + 0.17 * Math.sin(3 * t + p1) + 0.1 * Math.sin(5 * t + p2);
        if (dx * dx + dy * dy <= r * r) setCell(grid, x, y, x % 2 === 0 && y % 2 === 0 ? Cell.Wall : Cell.Floor);
      }
    // Corridors from the island center to the gates (odd row/column: never a pillar).
    const c = center(i);
    const links: (Dir4 | 'W')[] = [];
    if (path[i].dirToNext) links.push(path[i].dirToNext!);
    if (i > 0) links.push(opposite(path[i - 1].dirToNext!));
    for (const d of links) {
      const e = edgeCell(i, d);
      const sx = Math.sign(e.x - c.x);
      const sy = Math.sign(e.y - c.y);
      for (let x = c.x, y = c.y; ; x += sx, y += sy) {
        setCell(grid, x, y, Cell.Floor);
        corridor.add(cellIndex(grid, x, y));
        if (x === e.x && y === e.y) break;
      }
    }
    if (path[i].dirToNext) {
      const e = edgeCell(i, path[i].dirToNext!);
      setCell(grid, e.x, e.y, Cell.Wall); // sealed until the region is cleared
      gates.push({ id: gates.length, x: e.x, y: e.y, axis: path[i].dirToNext === 'E' ? 'h' : 'v', from: i, to: i + 1, open: false, openedTick: -1 });
    }
  }

  // 3. Player spawn pocket in region 0.
  const c0 = center(0);
  const spawns = [
    { x: c0.x, y: c0.y },
    { x: c0.x + 2, y: c0.y },
    { x: c0.x - 2, y: c0.y },
    { x: c0.x, y: c0.y + 2 },
  ];
  for (const sp of spawns) {
    setCell(grid, sp.x, sp.y, Cell.Floor);
    corridor.add(cellIndex(grid, sp.x, sp.y));
  }

  // 4. Destructible blocks: never on corridors, never next to gates, never in the spawn pocket.
  const nearGate = (x: number, y: number) => gates.some((g) => Math.abs(g.x - x) + Math.abs(g.y - y) <= 2);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = cellIndex(grid, x, y);
      if (grid.cells[i] !== Cell.Floor || corridor.has(i) || nearGate(x, y)) continue;
      if (Math.abs(x - c0.x) + Math.abs(y - c0.y) <= 3) continue;
      if (nextRandom(rngHolder) < ADVENTURE.blockFill) grid.cells[i] = Cell.Block;
    }

  const adventure: AdventureState = { chunkW: CW, chunkH: CH, regions, gates, regionOf, explored: new Uint8Array(W * H) };
  return { grid, adventure, spawns };
}

/** Each region gets its own Magmitos, away from the spawn and the gates. */
export function spawnAdventureEnemies(s: GameState) {
  const adv = s.adventure!;
  const spawn = s.players[0] ?? { x: 0, y: 0 };
  for (const r of adv.regions) {
    const count = Math.min(ADVENTURE.enemiesMax, ADVENTURE.enemiesBase + r.id);
    const free: { x: number; y: number }[] = [];
    for (let y = 0; y < s.grid.h; y++)
      for (let x = 0; x < s.grid.w; x++) {
        if (adv.regionOf[cellIndex(s.grid, x, y)] !== r.id || getCell(s.grid, x, y) !== Cell.Floor) continue;
        if (r.id === 0 && Math.abs(spawn.x - x) + Math.abs(spawn.y - y) < 6) continue;
        if (adv.gates.some((g) => Math.abs(g.x - x) + Math.abs(g.y - y) <= 1)) continue;
        free.push({ x, y });
      }
    for (let k = 0; k < count && free.length; k++) {
      const [c] = free.splice(randInt(s, free.length), 1);
      const e: EnemyState = { id: newId(s), kind: 'magmite', x: c.x, y: c.y, px: c.x, py: c.y, dir: null, tx: c.x, ty: c.y, alive: true, diedTick: -1, frozenUntil: 0, regionId: r.id };
      s.enemies.push(e);
    }
  }
}

/** Marks cells within the reveal radius of every living player as explored (unlocked regions only). */
export function revealAround(s: GameState) {
  const adv = s.adventure;
  if (!adv) return;
  const R = ADVENTURE.revealRadius;
  const r = Math.ceil(R);
  for (const p of s.players) {
    if (!p.alive) continue;
    const px = Math.round(p.x);
    const py = Math.round(p.y);
    for (let y = py - r; y <= py + r; y++)
      for (let x = px - r; x <= px + r; x++) {
        if (x < 0 || y < 0 || x >= s.grid.w || y >= s.grid.h) continue;
        if ((x - px) ** 2 + (y - py) ** 2 > R * R) continue;
        const i = cellIndex(s.grid, x, y);
        const reg = adv.regionOf[i];
        if (reg >= 0 && adv.regions[reg].unlocked) adv.explored[i] = 1;
      }
  }
}

/** Region objectives: when a region's Magmitos are all gone its gate opens and the next region unlocks. */
export function updateAdventure(s: GameState) {
  const adv = s.adventure;
  if (!adv) return;
  if (s.tick % 3 === 0) revealAround(s);
  for (const r of adv.regions) {
    if (r.cleared || !r.unlocked) continue;
    if (s.enemies.some((e) => e.alive && e.regionId === r.id)) continue;
    r.cleared = true;
    s.events.push({ type: 'regionCleared', region: r.id });
    for (const g of adv.gates) {
      if (g.from !== r.id || g.open) continue;
      g.open = true;
      g.openedTick = s.tick;
      setCell(s.grid, g.x, g.y, Cell.Floor);
      adv.regions[g.to].unlocked = true;
      s.events.push({ type: 'gateOpened', gateId: g.id, x: g.x, y: g.y, region: g.to });
      reviveAllies(s, g);
    }
  }
}

/** Seconds of spawn protection after coming back. */
const REVIVE_INVULN_SEC = 2.5;

/**
 * Co-op rule: every opened gate brings fallen allies back, standing at the gate on safe floor
 * (no bombs, flames, mines or Magmitos), blinking with spawn protection. They keep their power-ups.
 */
function reviveAllies(s: GameState, g: GateState) {
  const fallen = s.players.filter((p) => !p.alive && !p.left);
  if (!fallen.length) return;
  const spots = safeCellsNear(s, g.x, g.y, fallen.length);
  fallen.forEach((p, i) => {
    const c = spots[i] ?? { x: g.x, y: g.y };
    Object.assign(p, {
      alive: true,
      x: c.x,
      y: c.y,
      px: c.x,
      py: c.y,
      moving: false,
      slideDir: null,
      maneuver: null,
      frozenUntil: 0,
      passBombs: [],
      diedTick: -1,
      invulnUntil: s.tick + secToTicks(Math.max(REVIVE_INVULN_SEC, RULES.invulnSec)),
    });
    s.events.push({ type: 'playerRevived', playerId: p.id, x: c.x, y: c.y });
  });
}

/** Breadth-first search over walkable floor from (x, y): the closest `n` safe cells. */
function safeCellsNear(s: GameState, x: number, y: number, n: number) {
  const out: { x: number; y: number }[] = [];
  const seen = new Set<number>([cellIndex(s.grid, x, y)]);
  const queue = [{ x, y }];
  const safe = (cx: number, cy: number) =>
    !bombAt(s, cx, cy) && !mineAt(s, cx, cy) && flamesAt(s, cx, cy).length === 0 && !s.enemies.some((e) => e.alive && Math.round(e.x) === cx && Math.round(e.y) === cy);
  while (queue.length && out.length < n) {
    const c = queue.shift()!;
    if (safe(c.x, c.y)) out.push(c);
    for (const d of DIRS) {
      const nx = c.x + DIR_VEC[d].x;
      const ny = c.y + DIR_VEC[d].y;
      if (nx < 0 || ny < 0 || nx >= s.grid.w || ny >= s.grid.h) continue;
      const k = cellIndex(s.grid, nx, ny);
      if (seen.has(k) || getCell(s.grid, nx, ny) !== Cell.Floor) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return out;
}

/** Region the player stands in (for the HUD). */
export function regionAt(s: GameState, x: number, y: number) {
  const adv = s.adventure;
  if (!adv) return -1;
  const cx = Math.round(x);
  const cy = Math.round(y);
  if (cx < 0 || cy < 0 || cx >= s.grid.w || cy >= s.grid.h) return -1;
  return adv.regionOf[cellIndex(s.grid, cx, cy)];
}
