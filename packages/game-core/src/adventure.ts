import { ADVENTURE, Cell, CHARACTER_IDS, CHARACTERS, DIR_VEC, DIRS, POWERUPS, RULES, secToTicks, type BiomeId, type CharacterId, type PowerupType } from '@4walls/shared';
import { cellIndex, createGrid, getCell, inBounds, setCell } from './grid';
import { nextRandom, pickWeighted, randInt } from './rng';
import type { AdventureState, CageState, EnemyState, GameState, GateState, Grid, PlayerState, PropState, RegionDir, RegionObjectiveKind, RegionState } from './types';
import { bombAt, flamesAt, mineAt, newId, powerupAt } from './world';

/**
 * Endless Adventure.
 *
 * The world is an infinite lattice of chunks (ADVENTURE.chunkW × chunkH). Region N sits next to
 * region N − 1 (east, north or south — never back west), its layout comes only from (seed, N),
 * and it is generated when the group reaches region N − 1. Only a window of 1–3 regions is alive:
 * once everybody walks into a new region, the gate behind them seals and the old region is dropped.
 * The grid is a window in world coordinates (grid.x0 / y0), so nothing alive ever moves when the
 * window slides — memory, physics and rendering cost the same at region 3 or region 300.
 *
 * Servers and clients build identical regions from the seed; only the dynamic state (destroyed
 * blocks, props, gates, objectives) travels in snapshots.
 */

const CW = ADVENTURE.chunkW;
const CH = ADVENTURE.chunkH;
/** Seconds the gate behind the group stays open once the first player went through. */
export const GATE_CLOSE_SEC = 15;
/** Seconds of spawn protection after coming back. */
const REVIVE_INVULN_SEC = 2.5;

type Pt = { x: number; y: number };
const STEP: Record<RegionDir, [number, number]> = { E: [1, 0], N: [0, -1], S: [0, 1] };

// ───────────────────────────── seeds, names, difficulty ─────────────────────────────

/** Independent, well-mixed random stream per (seed, region, purpose). */
function subRng(seed: number, id: number, salt: number) {
  let h = (seed ^ Math.imul(id + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  h ^= h >>> 16;
  return { rng: h | 0 };
}

/** The first regions are a scripted introduction; after them everything is drawn from the seed. */
const SCRIPTED: { name: string; chapter: string; biome: BiomeId; objective: RegionObjectiveKind }[] = [
  { name: 'Caldeira Rasa', chapter: 'O despertar', biome: 'volcanic', objective: 'clear' },
  { name: 'Campos de Cinza', chapter: 'A infestação', biome: 'volcanic', objective: 'key' },
  { name: 'Rio de Magma', chapter: 'A travessia', biome: 'volcanic', objective: 'lever' },
  { name: 'Ponte de Obsidiana', chapter: 'O guardião', biome: 'transition', objective: 'key' },
  { name: 'Bosque Chamuscado', chapter: 'A corrupção', biome: 'forest', objective: 'clear' },
];

const NAME_PARTS: Record<BiomeId, { head: string[]; tail: string[] }> = {
  volcanic: {
    head: ['Vale', 'Cratera', 'Encosta', 'Planície', 'Fornalha', 'Garganta', 'Campos', 'Caldeirão', 'Escarpa', 'Bacia'],
    tail: ['das Brasas', 'de Cinza', 'do Enxofre', 'das Faíscas', 'de Basalto', 'da Lava Fria', 'do Fole', 'Rubra', 'Fumegante', 'do Carvão'],
  },
  transition: {
    head: ['Ponte', 'Passagem', 'Fenda', 'Limiar', 'Desfiladeiro', 'Travessia', 'Garganta'],
    tail: ['de Obsidiana', 'do Vapor', 'das Raízes', 'Partida', 'Cinzenta', 'dos Ecos', 'Velada'],
  },
  forest: {
    head: ['Bosque', 'Clareira', 'Mata', 'Trilha', 'Vereda', 'Grota', 'Brenha', 'Capoeira'],
    tail: ['Sussurrante', 'dos Ipês', 'das Sombras', 'Chamuscada', 'do Cipó', 'das Corujas', 'Encantada', 'dos Vagalumes'],
  },
};
const CHAPTERS: Record<RegionObjectiveKind, string[]> = {
  clear: ['A limpeza', 'O cerco', 'A emboscada', 'A infestação', 'O enxame'],
  key: ['A chave perdida', 'O cadeado', 'A busca', 'O segredo do portão', 'A relíquia'],
  lever: ['A travessia', 'A ponte levadiça', 'O rio de fogo', 'A outra margem'],
};
/** Biome rhythm of every arc (5 regions for now; varied arcs come with the next milestones). */
const ARC_BIOMES: BiomeId[] = ['volcanic', 'volcanic', 'volcanic', 'transition', 'forest'];

/** Name, chapter, biome and objective of region `id`: cheap, needs no world generation. */
export function regionInfo(seed: number, id: number) {
  if (id < SCRIPTED.length) return SCRIPTED[id];
  const r = subRng(seed, id, 3);
  const biome = ARC_BIOMES[id % ARC_BIOMES.length];
  // A lava river cuts some regions in two (never in the forest): cross it and pull the lever.
  const roll = nextRandom(r);
  const objective: RegionObjectiveKind = biome !== 'forest' && roll < 0.22 ? 'lever' : roll < 0.55 ? 'key' : 'clear';
  const parts = NAME_PARTS[biome];
  const name = `${parts.head[randInt(r, parts.head.length)]} ${parts.tail[randInt(r, parts.tail.length)]}`;
  const chapter = CHAPTERS[objective][randInt(r, CHAPTERS[objective].length)];
  return { name, chapter, biome, objective };
}

/**
 * The endless difficulty curve: fast early growth, then slow, with hard caps so deep regions get
 * harder through speed and density rather than by filling the screen.
 */
export function difficulty(depth: number) {
  const d = Math.max(0, depth);
  const enemies = d < 5 ? [2, 3, 4, 5, 5][d] : Math.min(ADVENTURE.enemiesCap, 5 + Math.floor((d - 4) / 2));
  return {
    enemies,
    enemySpeed: Math.min(1.6, 1 + 0.035 * Math.max(0, d - 4)),
    blockFill: d === 0 ? 0.36 : Math.min(0.56, ADVENTURE.blockFill + 0.012 * d),
    chestChance: Math.max(0.25, 0.6 - 0.03 * d),
    secretChance: d === 0 ? 1 : Math.max(0.35, 0.7 - 0.02 * d),
  };
}

/** Map mechanics of a region: shape, Fagulhas, ash vents, the braziers side mission. */
export interface RegionMods {
  shape: 'island' | 'plaza' | 'river';
  sparks: number;
  vents: number;
  braziers: boolean;
}

export function regionMods(seed: number, id: number): RegionMods {
  const enemies = difficulty(id).enemies;
  const scripted: (RegionMods | undefined)[] = [
    { shape: 'island', sparks: 0, vents: 0, braziers: false }, // O despertar: just the basics
    { shape: 'plaza', sparks: 2, vents: 2, braziers: true }, // A infestação: everything new at once
    { shape: 'island', sparks: 2, vents: 1, braziers: false },
    { shape: 'plaza', sparks: 2, vents: 1, braziers: true },
    { shape: 'island', sparks: 1, vents: 0, braziers: false },
  ];
  const river = regionInfo(seed, id).objective === 'lever';
  if (scripted[id]) return { ...scripted[id]!, ...(river ? { shape: 'river' as const, braziers: false } : {}), sparks: Math.min(scripted[id]!.sparks, enemies - 1) };
  const r = subRng(seed, id, 5);
  const biome = regionInfo(seed, id).biome;
  const shapeRoll = nextRandom(r);
  return {
    shape: river ? 'river' : shapeRoll < 0.35 ? 'plaza' : 'island',
    // Fagulhas take a growing share of the Magmitos as the journey goes on.
    sparks: Math.min(enemies - 1, Math.floor(enemies * Math.min(0.5, 0.15 + 0.03 * (id - 5)))),
    vents: biome === 'forest' ? 0 : nextRandom(r) < 0.55 ? 1 + randInt(r, 2) : 0,
    braziers: !river && nextRandom(r) < 0.4,
  };
}

// ───────────────────────────── lattice ─────────────────────────────

/** Grows the direction chain so that dirs[upTo] exists. Never two vertical steps in a row. */
function ensureChain(adv: AdventureState, seed: number, upTo: number) {
  while (adv.dirs.length <= upTo) {
    const i = adv.dirs.length;
    const prev = adv.dirs[i - 1];
    const pool: RegionDir[] = prev && prev !== 'E' ? ['E'] : ['E', 'E', 'E', 'N', 'S'];
    adv.dirs.push(pool[randInt(subRng(seed, i, 1), pool.length)]);
  }
}

function chunkOf(adv: AdventureState, id: number) {
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < id; i++) {
    cx += STEP[adv.dirs[i]][0];
    cy += STEP[adv.dirs[i]][1];
  }
  return { cx, cy };
}

const mod2 = (v: number) => ((v % 2) + 2) % 2;

function edgeCell(ox: number, oy: number, d: RegionDir | 'W'): Pt {
  if (d === 'E') return { x: ox + CW - 1, y: oy + 7 };
  if (d === 'W') return { x: ox, y: oy + 7 };
  if (d === 'N') return { x: ox + 7, y: oy };
  return { x: ox + 7, y: oy + CH - 1 };
}
const opposite = (d: RegionDir): RegionDir | 'W' => (d === 'E' ? 'W' : d === 'N' ? 'S' : 'N');

// ───────────────────────────── region generation ─────────────────────────────

interface Blueprint {
  state: RegionState;
  /** Chunk cells, row-major (CW × CH), in world space starting at (ox, oy). */
  cells: Uint8Array;
  ox: number;
  oy: number;
  exitGate: GateState;
  spawns: Pt[];
  cage: Pt | null;
  props: Omit<PropState, 'tick'>[];
  enemySpots: Pt[];
  enemyCount: number;
  enemySpeed: number;
  sparks: number;
}

/** Builds region `id` deterministically from the seed (chain must reach id + 1). */
function regionBlueprint(seed: number, adv: AdventureState, id: number): Blueprint {
  const info = regionInfo(seed, id);
  const diff = difficulty(id);
  const r = subRng(seed, id, 2);
  const { cx, cy } = chunkOf(adv, id);
  const ox = cx * CW;
  const oy = cy * CH;
  const cells = new Uint8Array(CW * CH).fill(Cell.Wall);
  const at = (x: number, y: number) => (y - oy) * CW + (x - ox);
  const inChunk = (x: number, y: number) => x >= ox && y >= oy && x < ox + CW && y < oy + CH;
  const get = (x: number, y: number) => (inChunk(x, y) ? cells[at(x, y)] : Cell.Wall);
  const set = (x: number, y: number, c: Cell) => {
    if (inChunk(x, y)) cells[at(x, y)] = c;
  };

  // 1. Organic island: a noisy ellipse inside the chunk (1-cell margin), pillars on even/even.
  const island = new Uint8Array(CW * CH);
  const p1 = nextRandom(r) * Math.PI * 2;
  const p2 = nextRandom(r) * Math.PI * 2;
  for (let y = oy + 1; y < oy + CH - 1; y++)
    for (let x = ox + 1; x < ox + CW - 1; x++) {
      const dx = (x + 0.5 - (ox + 8)) / 6.5;
      const dy = (y + 0.5 - (oy + 7)) / 5.5;
      const t = Math.atan2(dy, dx);
      const rr = 1 + 0.17 * Math.sin(3 * t + p1) + 0.1 * Math.sin(5 * t + p2);
      if (dx * dx + dy * dy > rr * rr) continue;
      island[at(x, y)] = 1;
      set(x, y, mod2(x) === 0 && mod2(y) === 0 ? Cell.Wall : Cell.Floor);
    }

  const mods = regionMods(seed, id);
  if (mods.shape === 'plaza') {
    const cx0 = ox + 7;
    const cy0 = oy + 7;
    for (let y = cy0 - 3; y <= cy0 + 3; y++)
      for (let x = cx0 - 4; x <= cx0 + 4; x++) {
        const dx = Math.abs(x - cx0);
        const dy = Math.abs(y - cy0);
        // Beds two cells away from the crossroads, leaving a ring path around each one.
        if (dx >= 2 && dx <= 3 && dy >= 1 && dy <= 2) set(x, y, Cell.Wall);
      }
  }

  // 2. Corridors from the center to the entry edge and to the exit edge (odd row/column).
  const center = { x: ox + 7, y: oy + 7 };
  const corridor = new Set<number>();
  const carve = (to: Pt) => {
    const sx = Math.sign(to.x - center.x);
    const sy = Math.sign(to.y - center.y);
    for (let x = center.x, y = center.y; ; x += sx, y += sy) {
      set(x, y, Cell.Floor);
      corridor.add(at(x, y));
      if (x === to.x && y === to.y) break;
    }
  };
  const exitDir = adv.dirs[id];
  const exit = edgeCell(ox, oy, exitDir);
  carve(exit);
  const entry = id > 0 ? edgeCell(ox, oy, opposite(adv.dirs[id - 1])) : null;
  if (entry) carve(entry);
  set(exit.x, exit.y, Cell.Wall); // sealed until the objective is done

  // 2b. Lava river: a band across the island between the center and the exit gate.
  const riverPlan = mods.shape === 'river' ? planRiver() : null;
  function planRiver() {
    const vertical = exitDir === 'E'; // the band is a few columns (runs north-south)
    const band = exitDir === 'E' ? [ox + 10, ox + 11, ox + 12] : exitDir === 'N' ? [oy + 4, oy + 5] : [oy + CH - 6, oy + CH - 5];
    const inBand = (x: number, y: number) => band.includes(vertical ? x : y);
    for (let y = oy; y < oy + CH; y++) for (let x = ox; x < ox + CW; x++) if (island[at(x, y)] && inBand(x, y)) set(x, y, Cell.Lava);
    // Crossing lines run perpendicular to the band: the corridor's line is the drawbridge.
    const along = (k: number, t: number): Pt => (vertical ? { x: t, y: k } : { x: k, y: t });
    const nearBank = band[0] - 1;
    const farBank = band[band.length - 1] + 1;
    const lineOk = (k: number) => {
      const a = along(k, nearBank);
      const b = along(k, farBank);
      return island[at(a.x, a.y)] === 1 && island[at(b.x, b.y)] === 1;
    };
    const mainLine = vertical ? oy + 7 : ox + 7;
    const options = [-2, 2, -3, 3, -4, 4, -1, 1].map((d) => mainLine + d).filter((k) => lineOk(k));
    const fragileLine = options[0] ?? null;
    const platformLine = options.find((k) => fragileLine === null || Math.abs(k - fragileLine) >= 2 && Math.sign(k - mainLine) !== Math.sign(fragileLine - mainLine)) ?? options.find((k) => k !== fragileLine) ?? null;
    const cellsOf = (k: number) => band.map((t) => along(k, t));
    for (const k of [mainLine, fragileLine, platformLine]) {
      if (k === null) continue;
      for (const t of [nearBank - 1, nearBank, farBank, farBank + 1]) {
        const c = along(k, t);
        if (island[at(c.x, c.y)]) set(c.x, c.y, Cell.Floor);
        corridor.add(at(c.x, c.y));
      }
    }
    // The lever stands on the far bank, beside where the drawbridge lands.
    const landing = along(mainLine, farBank);
    // Always present (the objective depends on it): right beside the landing, even at the coast.
    const leverSpot = [1, -1].map((d) => along(mainLine + d, farBank)).find((c) => island[at(c.x, c.y)] === 1) ?? along(mainLine + 1, farBank);
    set(leverSpot.x, leverSpot.y, Cell.Wall);
    island[at(leverSpot.x, leverSpot.y)] = 1;
    corridor.add(at(leverSpot.x, leverSpot.y));
    // A secret islet in the middle of a wide river: only a jump gets you there.
    let islet: Pt | null = null;
    if (band.length === 3) {
      const used = [mainLine, fragileLine, platformLine];
      const rows = options.filter((k) => !used.includes(k) && used.every((u) => u === null || Math.abs(u - k) >= 2));
      if (rows.length) {
        islet = along(rows[0], band[1]);
        set(islet.x, islet.y, Cell.Floor);
        corridor.add(at(islet.x, islet.y));
        for (const t of [nearBank, farBank]) {
          const c = along(rows[0], t);
          set(c.x, c.y, Cell.Floor);
          corridor.add(at(c.x, c.y));
        }
      }
    }
    // Cells of the river that can actually be crossed (for placing things on the far side).
    const crossings = new Set<number>();
    for (const k of [mainLine, fragileLine, platformLine])
      if (k !== null)
        for (const c of cellsOf(k)) {
          crossings.add(at(c.x, c.y));
          corridor.add(at(c.x, c.y)); // nothing else is ever placed on a crossing
        }
    return { vertical, band, nearBank, farBank, mainLine, fragileLine, platformLine, cellsOf, landing, leverSpot, islet, along, crossings };
  }

  // 3. The first region has a safe spawn pocket in the middle.
  const spawns: Pt[] = id === 0 ? [center, { x: center.x + 2, y: center.y }, { x: center.x - 2, y: center.y }, { x: center.x, y: center.y + 2 }] : [];
  for (const sp of spawns) {
    set(sp.x, sp.y, Cell.Floor);
    corridor.add(at(sp.x, sp.y));
  }

  const near = (a: Pt | null, x: number, y: number, d: number) => !!a && Math.abs(a.x - x) + Math.abs(a.y - y) <= d;
  const reserved = (x: number, y: number) => corridor.has(at(x, y)) || near(exit, x, y, 2) || near(entry, x, y, 2) || (id === 0 && near(center, x, y, 3));

  // 4. Destructible blocks (denser the deeper you go).
  for (let y = oy; y < oy + CH; y++)
    for (let x = ox; x < ox + CW; x++) {
      if (get(x, y) !== Cell.Floor || reserved(x, y)) continue;
      if (nextRandom(r) < diff.blockFill) set(x, y, Cell.Block);
    }

  // Walking distance from where the group arrives (blocks count as passable: they can be blown up).
  const start = entry ?? center;
  const dist = new Map<number, number>([[at(start.x, start.y), 0]]);
  const queue: Pt[] = [start];
  while (queue.length) {
    const c = queue.shift()!;
    for (const d of DIRS) {
      const nx = c.x + DIR_VEC[d].x;
      const ny = c.y + DIR_VEC[d].y;
      if (!inChunk(nx, ny) || get(nx, ny) === Cell.Wall || dist.has(at(nx, ny))) continue;
      // Lava only where a bridge or the platform crosses it.
      if (get(nx, ny) === Cell.Lava && !riverPlan?.crossings.has(at(nx, ny))) continue;
      dist.set(at(nx, ny), dist.get(at(c.x, c.y))! + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  const reachable = (x: number, y: number) => dist.has(at(x, y));
  const candidates = (pred: (x: number, y: number) => boolean) => {
    const out: Pt[] = [];
    for (let y = oy; y < oy + CH; y++) for (let x = ox; x < ox + CW; x++) if (reachable(x, y) && !reserved(x, y) && get(x, y) !== Cell.Lava && pred(x, y)) out.push({ x, y });
    return out;
  };
  const taken: Pt[] = [];
  const free = (x: number, y: number) => taken.every((t) => Math.abs(t.x - x) + Math.abs(t.y - y) > 1);

  const props: Omit<PropState, 'tick'>[] = [];
  let propSeq = 0;
  const propId = () => id * 64 + propSeq++;

  // 5. Objective: a key on a pedestal far from the exit gate.
  if (info.objective === 'key') {
    const far = candidates((x, y) => get(x, y) !== Cell.Wall).sort((a, b) => Math.abs(b.x - exit.x) + Math.abs(b.y - exit.y) - (Math.abs(a.x - exit.x) + Math.abs(a.y - exit.y)));
    const pool = far.slice(0, Math.max(1, Math.floor(far.length / 4)));
    const k = pool[randInt(r, pool.length)] ?? center;
    set(k.x, k.y, Cell.Floor);
    taken.push(k);
    props.push({ id: propId(), kind: 'key', region: id, x: k.x, y: k.y, state: 'idle', carrierId: null, homeX: k.x, homeY: k.y });
  }

  // 5b. River crossings: drawbridge (raised until the lever), fragile planks, a shuttle platform,
  // the lever, geysers on the banks and the islet's treasure.
  if (riverPlan) {
    const rp = riverPlan;
    for (const c of rp.cellsOf(rp.mainLine)) props.push({ id: propId(), kind: 'bridge', variant: 'draw', region: id, x: c.x, y: c.y, state: 'raised' });
    if (rp.fragileLine !== null)
      for (const c of rp.cellsOf(rp.fragileLine)) {
        set(c.x, c.y, Cell.Floor);
        props.push({ id: propId(), kind: 'bridge', variant: 'fragile', region: id, x: c.x, y: c.y, state: 'solid' });
      }
    if (rp.platformLine !== null) {
      const track = rp.cellsOf(rp.platformLine);
      set(track[0].x, track[0].y, Cell.Floor);
      props.push({ id: propId(), kind: 'platform', region: id, x: track[0].x, y: track[0].y, state: 'idle', track });
    }
    props.push({ id: propId(), kind: 'lever', region: id, x: rp.leverSpot.x, y: rp.leverSpot.y, state: 'off' });
    if (rp.islet) {
      taken.push(rp.islet);
      props.push({ id: propId(), kind: 'chest', region: id, x: rp.islet.x, y: rp.islet.y, state: 'closed', rare: true });
    }
    // Geysers on the near bank, two cells from the river.
    const bankSpots = candidates((x, y) => {
      if (get(x, y) !== Cell.Floor || !free(x, y)) return false;
      const t = rp.vertical ? x : y;
      return Math.abs(t - rp.nearBank) <= 2 || Math.abs(t - rp.farBank) <= 1;
    });
    for (let g = 0; g < 2 + (id > 6 ? 1 : 0) && bankSpots.length; g++) {
      const [c] = bankSpots.splice(randInt(r, bankSpots.length), 1);
      taken.push(c);
      props.push({ id: propId(), kind: 'geyser', region: id, x: c.x, y: c.y, state: 'idle' });
    }
  }

  // 6. One caged hero per region (it blocks like a crate until blown open).
  const cageSpots = candidates((x, y) => get(x, y) !== Cell.Wall && free(x, y) && !(id === 0 && near(center, x, y, 5)));
  const cage = cageSpots.length ? cageSpots[randInt(r, cageSpots.length)] : null;
  if (cage) {
    set(cage.x, cage.y, Cell.Block);
    taken.push(cage);
  }

  // 7. Secret: a cracked wall at the island's rim hiding a pocket with a rare chest.
  if (nextRandom(r) < diff.secretChance) {
    const options: { wall: Pt; pocket: Pt }[] = [];
    for (const c of candidates((x, y) => get(x, y) !== Cell.Wall))
      for (const d of DIRS) {
        const wall = { x: c.x + DIR_VEC[d].x, y: c.y + DIR_VEC[d].y };
        const pocket = { x: wall.x + DIR_VEC[d].x, y: wall.y + DIR_VEC[d].y };
        if (get(wall.x, wall.y) !== Cell.Wall || get(pocket.x, pocket.y) !== Cell.Wall) continue;
        if (pocket.x <= ox || pocket.y <= oy || pocket.x >= ox + CW - 1 || pocket.y >= oy + CH - 1) continue;
        // The pocket must only touch the cracked wall (no other way in).
        const sealed = DIRS.every((dd) => {
          const nx = pocket.x + DIR_VEC[dd].x;
          const ny = pocket.y + DIR_VEC[dd].y;
          return (nx === wall.x && ny === wall.y) || get(nx, ny) === Cell.Wall;
        });
        if (sealed && !near(exit, wall.x, wall.y, 2) && !near(entry, wall.x, wall.y, 2)) options.push({ wall, pocket });
      }
    if (options.length) {
      const o = options[randInt(r, options.length)];
      set(o.wall.x, o.wall.y, Cell.Cracked);
      set(o.pocket.x, o.pocket.y, Cell.Floor);
      taken.push(o.pocket);
      props.push({ id: propId(), kind: 'chest', region: id, x: o.pocket.x, y: o.pocket.y, state: 'closed', rare: true });
    }
  }

  // 8. A common chest out in the open, sometimes.
  if (nextRandom(r) < diff.chestChance) {
    const spots = candidates((x, y) => get(x, y) === Cell.Floor && free(x, y));
    if (spots.length) {
      const c = spots[randInt(r, spots.length)];
      taken.push(c);
      props.push({ id: propId(), kind: 'chest', region: id, x: c.x, y: c.y, state: 'closed', rare: false });
    }
  }

  // 9. Ash vents: grates in the floor that puff blinding ash clouds now and then (walkable).
  for (let v = 0; v < mods.vents; v++) {
    const spots = candidates((x, y) => get(x, y) === Cell.Floor && free(x, y));
    if (!spots.length) break;
    const c = spots[randInt(r, spots.length)];
    taken.push(c);
    props.push({ id: propId(), kind: 'vent', region: id, x: c.x, y: c.y, state: 'idle' });
  }

  // 10. Side mission: three braziers on the island's rim; lighting all of them (blasts next to
  // them) reveals a rare chest.
  if (mods.braziers) {
    const rim = candidates(
      (x, y) => get(x, y) === Cell.Floor && free(x, y) && DIRS.some((d) => get(x + DIR_VEC[d].x, y + DIR_VEC[d].y) === Cell.Wall && !(mod2(x + DIR_VEC[d].x) === 0 && mod2(y + DIR_VEC[d].y) === 0)),
    );
    // A brazier becomes a pillar: it may never cut the island in two.
    const reachableCount = () => {
      const seen = new Set<number>([at(start.x, start.y)]);
      const q: Pt[] = [start];
      while (q.length) {
        const c = q.shift()!;
        for (const d of DIRS) {
          const nx = c.x + DIR_VEC[d].x;
          const ny = c.y + DIR_VEC[d].y;
          if (!inChunk(nx, ny) || get(nx, ny) === Cell.Wall || seen.has(at(nx, ny))) continue;
          seen.add(at(nx, ny));
          q.push({ x: nx, y: ny });
        }
      }
      return seen.size;
    };
    // Removing one reachable cell may only lose that cell (never cut off anything behind it).
    let base = reachableCount();
    const keepsConnected = (c: Pt) => {
      const before = get(c.x, c.y);
      set(c.x, c.y, Cell.Wall);
      const ok = reachableCount() === base - 1;
      set(c.x, c.y, before as Cell);
      return ok;
    };
    const picked: Pt[] = [];
    for (let tries = 0; tries < 60 && picked.length < 3 && rim.length; tries++) {
      const c = rim[randInt(r, rim.length)];
      if (!picked.every((q) => Math.abs(q.x - c.x) + Math.abs(q.y - c.y) >= 6) || !keepsConnected(c)) continue;
      picked.push(c);
      set(c.x, c.y, Cell.Wall); // reserve now so the next one is checked against it
      base -= 1;
    }
    const reward = candidates((x, y) => get(x, y) === Cell.Floor && free(x, y) && picked.every((q) => Math.abs(q.x - x) + Math.abs(q.y - y) > 2));
    if (picked.length !== 3 || !reward.length) for (const c of picked) set(c.x, c.y, Cell.Floor);
    if (picked.length === 3 && reward.length) {
      for (const c of picked) {
        // The brazier stands on its cell like a pillar; a blast on any side lights it.
        taken.push(c);
        props.push({ id: propId(), kind: 'brazier', region: id, x: c.x, y: c.y, state: 'unlit' });
      }
      const ch = reward[randInt(r, reward.length)];
      taken.push(ch);
      props.push({ id: propId(), kind: 'chest', region: id, x: ch.x, y: ch.y, state: 'hidden', rare: true });
    }
  }

  // 11. Where Magmitos may start: open floor, away from the arrival point, gates, cage and props.
  const enemySpots = candidates((x, y) => get(x, y) === Cell.Floor && !near(start, x, y, 5) && free(x, y));
  for (let i = enemySpots.length - 1; i > 0; i--) {
    const j = randInt(r, i + 1);
    [enemySpots[i], enemySpots[j]] = [enemySpots[j], enemySpots[i]];
  }

  const state: RegionState = {
    id,
    name: info.name,
    chapter: info.chapter,
    biome: info.biome,
    cx,
    cy,
    objective: { kind: info.objective, progress: 0, goal: info.objective === 'clear' ? diff.enemies : 1, done: false },
    unlocked: id === 0,
    cleared: false,
    entry,
  };
  const exitGate: GateState = { id, x: exit.x, y: exit.y, axis: exitDir === 'E' ? 'h' : 'v', from: id, to: id + 1, open: false, openedTick: -1, kind: 'exit' };
  return { state, cells, ox, oy, exitGate, spawns, cage, props, enemySpots, enemyCount: diff.enemies, enemySpeed: diff.enemySpeed, sparks: mods.sparks };
}

// ───────────────────────────── the live window ─────────────────────────────

/** Re-allocates the grid around the given regions, keeping the live cells of the ones already there. */
function rebuildWindow(s: GameState, regions: RegionState[], fresh: Map<number, Blueprint>) {
  const adv = s.adventure!;
  const minCx = Math.min(...regions.map((r) => r.cx));
  const maxCx = Math.max(...regions.map((r) => r.cx));
  const minCy = Math.min(...regions.map((r) => r.cy));
  const maxCy = Math.max(...regions.map((r) => r.cy));
  const old = s.grid;
  const oldRegionOf = adv.regionOf;
  const oldExplored = adv.explored;
  const grid = createGrid((maxCx - minCx + 1) * CW, (maxCy - minCy + 1) * CH, minCx * CW, minCy * CH);
  grid.cells.fill(Cell.Wall);
  const regionOf = new Int16Array(grid.w * grid.h).fill(-1);
  const explored = new Uint8Array(grid.w * grid.h);
  for (const reg of regions) {
    const ox = reg.cx * CW;
    const oy = reg.cy * CH;
    const bp = fresh.get(reg.id);
    for (let y = oy; y < oy + CH; y++)
      for (let x = ox; x < ox + CW; x++) {
        const i = cellIndex(grid, x, y);
        regionOf[i] = reg.id;
        if (bp) grid.cells[i] = bp.cells[(y - oy) * CW + (x - ox)];
        else if (old && inBounds(old, x, y)) {
          const j = cellIndex(old, x, y);
          grid.cells[i] = old.cells[j];
          explored[i] = oldExplored[j];
          if (oldRegionOf[j] !== reg.id) regionOf[i] = reg.id;
        }
      }
  }
  s.grid = grid;
  adv.regionOf = regionOf;
  adv.explored = explored;
  adv.regions = [...regions].sort((a, b) => a.id - b.id);
  adv.windowKey = adv.regions.map((r) => r.id).join(',');
}

/**
 * Adds region `id` to the live window. `authority` (server or local game) also populates it with
 * Magmitos and reports the event; mirrors (online clients) only rebuild the geometry.
 */
export function attachRegion(s: GameState, id: number, authority = true) {
  const adv = s.adventure!;
  if (adv.regions.some((r) => r.id === id)) return null;
  ensureChain(adv, s.config.seed, id + 1);
  const bp = regionBlueprint(s.config.seed, adv, id);
  rebuildWindow(s, [...adv.regions, bp.state], new Map([[id, bp]]));
  adv.gates.push(bp.exitGate);
  if (bp.cage) adv.cages.push({ id, x: bp.cage.x, y: bp.cage.y, region: id, state: 'locked' });
  for (const p of bp.props) adv.props.push({ ...p, tick: s.tick });
  if (authority) {
    populate(s, bp);
    s.events.push({ type: 'regionAttached', region: id });
  }
  return bp;
}

/** Puts the region's enemies in place (the first spots get Fagulhas) and sets the clear goal. */
function populate(s: GameState, bp: Blueprint) {
  const id = bp.state.id;
  const n = Math.min(bp.enemyCount, bp.enemySpots.length);
  for (let k = 0; k < n; k++) {
    const c = bp.enemySpots[k];
    const spark = k < bp.sparks;
    const e: EnemyState = {
      id: newId(s),
      kind: spark ? 'spark' : 'magmite',
      x: c.x,
      y: c.y,
      px: c.x,
      py: c.y,
      dir: null,
      tx: c.x,
      ty: c.y,
      alive: true,
      diedTick: -1,
      frozenUntil: 0,
      regionId: id,
      speedMul: bp.enemySpeed,
      ...(spark ? { mode: 'wander' as const, modeUntil: 0 } : {}),
    };
    s.enemies.push(e);
  }
  const reg = s.adventure!.regions.find((x) => x.id === id);
  if (reg && reg.objective.kind === 'clear') reg.objective.goal = n;
}

/** Drops region `id` and everything in it; the next region's entry seals for good. */
export function detachRegion(s: GameState, id: number, authority = true) {
  const adv = s.adventure!;
  const reg = adv.regions.find((r) => r.id === id);
  if (!reg) return;
  const ox = reg.cx * CW;
  const oy = reg.cy * CH;
  const inside = (x: number, y: number) => Math.round(x) >= ox && Math.round(y) >= oy && Math.round(x) < ox + CW && Math.round(y) < oy + CH;
  adv.gates = adv.gates.filter((g) => g.from !== id && !(g.kind === 'back' && g.to === id));
  adv.cages = adv.cages.filter((c) => c.region !== id);
  adv.props = adv.props.filter((p) => p.region !== id);
  s.enemies = s.enemies.filter((e) => e.regionId !== id && !inside(e.x, e.y));
  s.bombs = s.bombs.filter((b) => !inside(b.x, b.y));
  s.flames = s.flames.filter((f) => !inside(f.x, f.y));
  s.powerups = s.powerups.filter((p) => !inside(p.x, p.y));
  s.mines = s.mines.filter((m) => !inside(m.x, m.y));
  rebuildWindow(s, adv.regions.filter((r) => r.id !== id), new Map());
  // Seal the way back.
  const next = adv.regions.find((r) => r.id === id + 1);
  if (next?.entry) {
    setCell(s.grid, next.entry.x, next.entry.y, Cell.Wall);
    const prevDir = adv.dirs[id];
    adv.gates.push({ id: 1_000_000 + next.id, x: next.entry.x, y: next.entry.y, axis: prevDir === 'E' ? 'h' : 'v', from: id, to: next.id, open: false, openedTick: -1, kind: 'back' });
  }
  if (authority) s.events.push({ type: 'regionDetached', region: id });
}

/** Mirrors (online clients): make the live window match the server's list of region ids. */
export function syncAdventureWindow(s: GameState, ids: number[]) {
  const adv = s.adventure;
  if (!adv) return;
  const want = new Set(ids);
  for (const id of [...ids].sort((a, b) => a - b)) if (!adv.regions.some((r) => r.id === id)) attachRegion(s, id, false);
  for (const r of [...adv.regions]) if (!want.has(r.id)) detachRegion(s, r.id, false);
}

/** Initial state: regions 0 and 1 (the second one visible behind the first gate). */
export function createAdventure(seed: number): { grid: Grid; adventure: AdventureState; spawns: Pt[] } {
  const adventure: AdventureState = {
    chunkW: CW,
    chunkH: CH,
    depth: 0,
    regions: [],
    gates: [],
    regionOf: new Int16Array(0),
    explored: new Uint8Array(0),
    cages: [],
    props: [],
    closing: null,
    journey: [],
    dirs: [],
    windowKey: '',
  };
  const s = { config: { seed }, adventure, grid: null as unknown as Grid, tick: 0, events: [], enemies: [], bombs: [], flames: [], powerups: [], mines: [] } as unknown as GameState;
  const bp = attachRegion(s, 0, false)!;
  attachRegion(s, 1, false);
  const first = regionInfo(seed, 0);
  adventure.journey.push({ id: 0, name: first.name, biome: first.biome });
  return { grid: s.grid, adventure, spawns: bp.spawns };
}

/** The real game state's regions get their Magmitos once the players exist. */
export function spawnAdventureEnemies(s: GameState) {
  const adv = s.adventure!;
  const ids = adv.regions.map((r) => r.id);
  // Re-attach with authority: same geometry (deterministic), plus enemies.
  for (const id of ids) populate(s, regionBlueprint(s.config.seed, adv, id));
}

// ───────────────────────────── per-tick rules ─────────────────────────────

/** Region objectives, props, the window sliding along with the group. */
export function updateAdventure(s: GameState) {
  const adv = s.adventure;
  if (!adv) return;
  if (s.tick % 3 === 0) revealAround(s);
  updateRiver(s);
  updateLavaFalls(s);
  updateCages(s);
  updateProps(s);
  updateObjectives(s);
  updateProgress(s);
}

function updateObjectives(s: GameState) {
  const adv = s.adventure!;
  for (const r of adv.regions) {
    if (r.cleared || !r.unlocked) continue;
    const o = r.objective;
    let progress = o.progress;
    if (o.kind === 'clear') progress = Math.max(0, o.goal - s.enemies.filter((e) => e.alive && e.regionId === r.id).length);
    else if (o.kind === 'key') progress = adv.props.some((p) => p.kind === 'key' && p.region === r.id && p.state === 'used') ? 1 : 0;
    else if (o.kind === 'lever') progress = adv.props.some((p) => p.kind === 'lever' && p.region === r.id && p.state === 'on') ? 1 : 0;
    if (progress !== o.progress) {
      o.progress = progress;
      s.events.push({ type: 'objectiveProgress', region: r.id, progress, goal: o.goal });
    }
    if (progress < o.goal) continue;
    o.done = true;
    r.cleared = true;
    s.events.push({ type: 'regionCleared', region: r.id });
    if (!adv.regions.some((x) => x.id === r.id + 1)) attachRegion(s, r.id + 1);
    const g = adv.gates.find((x) => x.kind !== 'back' && x.from === r.id);
    if (g && !g.open) {
      g.open = true;
      g.openedTick = s.tick;
      setCell(s.grid, g.x, g.y, Cell.Floor);
      const next = adv.regions.find((x) => x.id === r.id + 1);
      if (next) next.unlocked = true;
      s.events.push({ type: 'gateOpened', gateId: g.id, x: g.x, y: g.y, region: r.id + 1 });
      reviveAllies(s, g);
    }
  }
}

/** Entering deeper regions, attaching the one after, and sealing the way back. */
function updateProgress(s: GameState) {
  const adv = s.adventure!;
  const living = s.players.filter((p) => p.alive);
  for (const p of living) {
    const rid = regionAt(s, p.x, p.y);
    if (rid <= adv.depth) continue;
    adv.depth = rid;
    const info = regionInfo(s.config.seed, rid);
    adv.journey.push({ id: rid, name: info.name, biome: info.biome });
    s.events.push({ type: 'regionEntered', region: rid });
    attachRegion(s, rid + 1); // the next island shows up behind the new (closed) gate
    adv.closing = { region: rid, atTick: s.tick + secToTicks(GATE_CLOSE_SEC) };
    s.events.push({ type: 'gateClosing', region: rid, atTick: adv.closing.atTick });
  }
  const c = adv.closing;
  if (!c) return;
  const behind = adv.regions.filter((r) => r.id < c.region);
  if (!behind.length) {
    adv.closing = null;
    return;
  }
  const allIn = living.every((p) => regionAt(s, p.x, p.y) >= c.region);
  if (!allIn && s.tick < c.atTick) return;
  // Time's up: stragglers are pulled through so nobody is left in a region about to vanish.
  const reg = adv.regions.find((r) => r.id === c.region)!;
  const stragglers = living.filter((p) => regionAt(s, p.x, p.y) < c.region);
  if (stragglers.length && reg.entry) {
    // Never the entry cell itself: it becomes the sealed back gate.
    const e = reg.entry;
    const spots = safeCellsNear(s, e.x, e.y, stragglers.length + 6).filter((q) => regionAt(s, q.x, q.y) === c.region && (q.x !== e.x || q.y !== e.y));
    stragglers.forEach((p, i) => {
      const q = spots[i] ?? spots[0] ?? { x: reg.cx * CW + 7, y: reg.cy * CH + 7 };
      Object.assign(p, { x: q.x, y: q.y, px: q.x, py: q.y, maneuver: null, slideDir: null, moving: false, passBombs: [] });
    });
  }
  for (const r of behind) detachRegion(s, r.id);
  adv.closing = null;
  s.events.push({ type: 'gateClosed', region: c.region });
}

// ───────────────────────────── the lava river ─────────────────────────────

const FRAGILE_CRACK = 60; // ticks a fragile bridge shakes before giving way
const FRAGILE_BACK = 360; // ticks until it is rebuilt
export const GEYSER_PERIOD = 330;
export const GEYSER_WARN = 72;
const GEYSER_BURST = 42;
const PLATFORM_MOVE = 48; // ticks per cell
const PLATFORM_WAIT = 72; // ticks at each bank

/**
 * Shuttle platform position along its track at a (fractional) tick: wait at the near bank, glide
 * across, wait at the far bank, glide back. Pure function of the tick: clients draw it the same.
 */
export function platformPos(p: PropState, tick: number): { x: number; y: number; i: number } {
  const track = p.track!;
  const n = track.length;
  const leg = (n - 1) * PLATFORM_MOVE;
  const cycle = 2 * (PLATFORM_WAIT + leg);
  const t = (((tick + p.id * 37) % cycle) + cycle) % cycle;
  let f: number; // 0..n-1 along the track
  if (t < PLATFORM_WAIT) f = 0;
  else if (t < PLATFORM_WAIT + leg) f = (t - PLATFORM_WAIT) / PLATFORM_MOVE;
  else if (t < 2 * PLATFORM_WAIT + leg) f = n - 1;
  else f = n - 1 - (t - 2 * PLATFORM_WAIT - leg) / PLATFORM_MOVE;
  const i = Math.min(n - 2, Math.max(0, Math.floor(f)));
  const k = n > 1 ? f - i : 0;
  const a = track[i];
  const b = track[Math.min(n - 1, i + 1)];
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, i: Math.round(f) };
}

/** Geyser phase at a tick: 0..GEYSER_PERIOD-1 (bursts at 0, warns in the last GEYSER_WARN ticks). */
export const geyserPhase = (p: PropState, tick: number) => (((tick + p.id * 61) % GEYSER_PERIOD) + GEYSER_PERIOD) % GEYSER_PERIOD;

const airborne = (p: PlayerState) => p.maneuver?.kind === 'jump';

function updateRiver(s: GameState) {
  const adv = s.adventure!;
  for (const pr of adv.props) {
    if (pr.kind === 'bridge' && pr.variant === 'fragile') {
      if (pr.state === 'solid') {
        const on = s.players.some((p) => p.alive && !airborne(p) && Math.round(p.x) === pr.x && Math.round(p.y) === pr.y);
        if (on) {
          pr.state = 'cracking';
          pr.tick = s.tick;
          s.events.push({ type: 'bridgeCracking', propId: pr.id, x: pr.x, y: pr.y });
        }
      } else if (pr.state === 'cracking' && s.tick - pr.tick >= FRAGILE_CRACK) {
        pr.state = 'fallen';
        pr.tick = s.tick;
        setCell(s.grid, pr.x, pr.y, Cell.Lava);
        s.events.push({ type: 'bridgeFell', propId: pr.id, x: pr.x, y: pr.y });
      } else if (pr.state === 'fallen' && s.tick - pr.tick >= FRAGILE_BACK) {
        pr.state = 'solid';
        pr.tick = s.tick;
        setCell(s.grid, pr.x, pr.y, Cell.Floor);
        s.events.push({ type: 'bridgeRestored', propId: pr.id, x: pr.x, y: pr.y });
      }
    } else if (pr.kind === 'platform' && pr.track) {
      const before = platformPos(pr, s.tick - 1);
      const now = platformPos(pr, s.tick);
      const dx = now.x - before.x;
      const dy = now.y - before.y;
      if (dx || dy) {
        // Riders move with it (not someone mid-jump).
        for (const p of s.players)
          if (p.alive && !airborne(p) && Math.abs(p.x - before.x) < 0.55 && Math.abs(p.y - before.y) < 0.55) {
            p.x += dx;
            p.y += dy;
            p.px += dx;
            p.py += dy;
          }
      }
      const cell = pr.track[now.i];
      if (cell.x !== pr.x || cell.y !== pr.y) {
        setCell(s.grid, pr.x, pr.y, Cell.Lava);
        setCell(s.grid, cell.x, cell.y, Cell.Floor);
        for (const b of s.bombs)
          if (b.x === pr.x && b.y === pr.y) {
            b.x = cell.x;
            b.y = cell.y;
            b.fromX = cell.x;
            b.fromY = cell.y;
          }
        pr.x = cell.x;
        pr.y = cell.y;
      }
    } else if (pr.kind === 'geyser') {
      const ph = geyserPhase(pr, s.tick);
      if (ph === GEYSER_PERIOD - GEYSER_WARN) s.events.push({ type: 'geyserWarn', propId: pr.id, x: pr.x, y: pr.y });
      if (ph === 0) {
        s.flames.push({ x: pr.x, y: pr.y, part: 'center', dir: null, bombId: -1, ownerId: '', bornTick: s.tick, untilTick: s.tick + GEYSER_BURST, kind: 'normal' });
        s.events.push({ type: 'geyserErupt', propId: pr.id, x: pr.x, y: pr.y });
      }
    } else if (pr.kind === 'lever' && pr.state === 'off') {
      const hit = DIRS.some((d) => flamesAt(s, pr.x + DIR_VEC[d].x, pr.y + DIR_VEC[d].y).some((f) => f.bombId !== -1));
      if (!hit) continue;
      pr.state = 'on';
      pr.tick = s.tick;
      s.events.push({ type: 'leverPulled', propId: pr.id, x: pr.x, y: pr.y, region: pr.region });
      for (const b of adv.props)
        if (b.kind === 'bridge' && b.variant === 'draw' && b.region === pr.region && b.state === 'raised') {
          b.state = 'lowered';
          b.tick = s.tick;
          setCell(s.grid, b.x, b.y, Cell.Floor);
        }
    }
  }
}

/** Whatever stands on lava (not jumping over it) is lost: players, Magmitos, bombs, power-ups. */
function updateLavaFalls(s: GameState) {
  const lava = (x: number, y: number) => getCell(s.grid, Math.round(x), Math.round(y)) === Cell.Lava;
  for (const p of s.players) {
    if (!p.alive || airborne(p) || !lava(p.x, p.y)) continue;
    // A fall ignores shields: nothing to stand on.
    p.alive = false;
    p.diedTick = s.tick;
    p.moving = false;
    p.passBombs = [];
    p.maneuver = null;
    s.events.push({ type: 'playerFell', playerId: p.id, x: p.x, y: p.y });
    s.events.push({ type: 'playerDied', playerId: p.id, byId: null, x: p.x, y: p.y });
  }
  for (const e of s.enemies)
    if (e.alive && lava(e.x, e.y)) {
      e.alive = false;
      e.diedTick = s.tick;
      s.events.push({ type: 'enemyDied', enemyId: e.id, byId: '', x: e.x, y: e.y });
    }
  const sink = <T extends { x: number; y: number }>(list: T[]) =>
    list.filter((o) => {
      if (!lava(o.x, o.y)) return true;
      s.events.push({ type: 'sankInLava', x: o.x, y: o.y });
      return false;
    });
  // Bombs still flying (thrown with the glove) cross the river safely.
  s.bombs = s.bombs.filter((b) => {
    if (s.tick < b.flightUntil || !lava(b.x, b.y)) return true;
    s.events.push({ type: 'sankInLava', x: b.x, y: b.y });
    return false;
  });
  s.powerups = sink(s.powerups);
}

// ───────────────────────────── props: chests and keys ─────────────────────────────

const RARE_LOOT: PowerupType[] = ['shield', 'kick', 'remote', 'glove', 'ghost', 'boots', 'infernal', 'ice'];

function updateProps(s: GameState) {
  const adv = s.adventure!;
  for (const pr of adv.props) {
    if (pr.kind === 'chest' && pr.state === 'closed') {
      const opener = s.players.find((p) => p.alive && Math.round(p.x) === pr.x && Math.round(p.y) === pr.y);
      const burned = flamesAt(s, pr.x, pr.y).length > 0;
      if (opener || burned) openChest(s, pr, opener?.id ?? null);
    } else if (pr.kind === 'key') updateKey(s, pr);
    else if (pr.kind === 'brazier' && pr.state === 'unlit') {
      const touched = DIRS.some((d) => flamesAt(s, pr.x + DIR_VEC[d].x, pr.y + DIR_VEC[d].y).length > 0);
      if (!touched) continue;
      pr.state = 'lit';
      pr.tick = s.tick;
      const all = adv.props.filter((q) => q.kind === 'brazier' && q.region === pr.region);
      const lit = all.filter((q) => q.state === 'lit').length;
      s.events.push({ type: 'brazierLit', propId: pr.id, x: pr.x, y: pr.y, region: pr.region, lit, goal: all.length });
      if (lit === all.length) {
        const chest = adv.props.find((q) => q.kind === 'chest' && q.region === pr.region && q.state === 'hidden');
        if (chest) {
          chest.state = 'closed';
          chest.tick = s.tick;
          s.events.push({ type: 'missionDone', region: pr.region, x: chest.x, y: chest.y });
        }
      }
    }
  }
}

function openChest(s: GameState, pr: PropState, byId: string | null) {
  pr.state = 'open';
  pr.tick = s.tick;
  s.events.push({ type: 'chestOpened', propId: pr.id, x: pr.x, y: pr.y, rare: !!pr.rare, byId });
  const loot: PowerupType[] = [pickWeighted(s, Object.values(POWERUPS), (d) => d.weight).type];
  if (pr.rare) loot.push(RARE_LOOT[randInt(s, RARE_LOOT.length)]);
  const spots = [{ x: pr.x, y: pr.y }, ...DIRS.map((d) => ({ x: pr.x + DIR_VEC[d].x, y: pr.y + DIR_VEC[d].y }))].filter(
    (c) => getCell(s.grid, c.x, c.y) === Cell.Floor && !bombAt(s, c.x, c.y) && !powerupAt(s, c.x, c.y),
  );
  loot.forEach((type, i) => {
    // A secret pocket has no room around it: extra loot stacks on the chest (picked up one by one).
    const c = spots[i] ?? { x: pr.x, y: pr.y };
    const id = newId(s);
    s.powerups.push({ id, type, x: c.x, y: c.y, bornTick: s.tick });
    s.events.push({ type: 'powerupSpawned', id, x: c.x, y: c.y, powerup: type });
  });
}

function updateKey(s: GameState, k: PropState) {
  const adv = s.adventure!;
  if (k.state === 'used') return;
  if (k.state === 'idle') {
    const p = s.players.find((pp) => pp.alive && Math.round(pp.x) === k.x && Math.round(pp.y) === k.y);
    if (!p) return;
    k.state = 'carried';
    k.carrierId = p.id;
    s.events.push({ type: 'keyPicked', propId: k.id, playerId: p.id });
    return;
  }
  const carrier = s.players.find((p) => p.id === k.carrierId);
  if (!carrier || !carrier.alive) {
    // Dropped where the carrier fell (back to the pedestal if that spot isn't floor).
    const x = carrier ? Math.round(carrier.x) : k.homeX!;
    const y = carrier ? Math.round(carrier.y) : k.homeY!;
    const ok = getCell(s.grid, x, y) === Cell.Floor && regionAt(s, x, y) === k.region;
    k.x = ok ? x : k.homeX!;
    k.y = ok ? y : k.homeY!;
    k.state = 'idle';
    k.carrierId = null;
    s.events.push({ type: 'keyDropped', propId: k.id, x: k.x, y: k.y });
    return;
  }
  k.x = Math.round(carrier.x);
  k.y = Math.round(carrier.y);
  const gate = adv.gates.find((g) => g.kind !== 'back' && g.from === k.region);
  if (gate && !gate.open && Math.abs(gate.x - carrier.x) + Math.abs(gate.y - carrier.y) <= 1.15) {
    k.state = 'used';
    k.carrierId = null;
    k.x = gate.x;
    k.y = gate.y;
    s.events.push({ type: 'keyDelivered', propId: k.id, playerId: carrier.id, region: k.region });
  }
}

/** Carrying the gate key slows you down a little: the group is invited to escort the carrier. */
export function carriesKey(s: GameState, playerId: string) {
  return !!s.adventure?.props.some((k) => k.kind === 'key' && k.carrierId === playerId);
}

// ───────────────────────────── caged heroes ─────────────────────────────

/** Blasts free prisoners; touching a free prisoner rescues them. */
function updateCages(s: GameState) {
  const adv = s.adventure!;
  for (const c of adv.cages) {
    if (c.state === 'locked') {
      if (getCell(s.grid, c.x, c.y) === Cell.Block) continue;
      c.state = 'free';
      s.events.push({ type: 'cageOpened', cageId: c.id, x: c.x, y: c.y });
      continue;
    }
    if (c.state !== 'free') continue;
    const rescuer = s.players.find((p) => p.alive && Math.round(p.x) === c.x && Math.round(p.y) === c.y);
    if (rescuer) rescueHero(s, c, rescuer);
  }
}

/**
 * The rescue rule:
 * - a fallen ally (not one who left the match) comes back at the cage as the drawn hero;
 * - otherwise the rescuer turns into the drawn hero.
 * The draw covers every hero (owned or not, the game doesn't know accounts) except the one the
 * receiving player already is.
 */
export function rescueHero(s: GameState, c: CageState, rescuer: PlayerState) {
  c.state = 'rescued';
  const fallen = s.players.find((p) => !p.alive && !p.left);
  const target = fallen ?? rescuer;
  const pool = CHARACTER_IDS.filter((id) => id !== target.characterId);
  const hero = pool[randInt(s, pool.length)];
  const previousId = target.characterId;
  if (fallen) {
    const spot = safeCellsNear(s, c.x, c.y, 1)[0] ?? { x: c.x, y: c.y };
    Object.assign(fallen, { alive: true, x: spot.x, y: spot.y, px: spot.x, py: spot.y, moving: false, slideDir: null, maneuver: null, frozenUntil: 0, passBombs: [], diedTick: -1 });
  }
  becomeHero(s, target, hero);
  target.invulnUntil = s.tick + secToTicks(Math.max(REVIVE_INVULN_SEC, RULES.invulnSec));
  s.events.push({ type: 'heroJoined', playerId: target.id, byId: rescuer.id, characterId: hero, previousId, revived: !!fallen, x: target.x, y: target.y });
}

/** Swaps a player's class, keeping the power-ups they earned (speed and bomb perks re-based). */
export function becomeHero(s: GameState, p: PlayerState, id: CharacterId) {
  const from = CHARACTERS[p.characterId as CharacterId] ?? CHARACTERS.bombito;
  const to = CHARACTERS[id];
  p.characterId = id;
  p.speed = Math.min(RULES.maxSpeed, Math.max(1.5, p.speed - from.speedBonus + to.speedBonus));
  p.range = Math.min(RULES.maxRange, Math.max(RULES.baseRange, p.range - from.rangeBonus + to.rangeBonus));
  p.maxBombs = Math.min(to.maxBombs, Math.max(RULES.baseBombs, p.maxBombs - from.bombBonus + to.bombBonus));
  if (to.startsWithKick) p.canKick = true;
  p.abilityReadyTick = s.tick; // the new ability is ready right away
  p.turboUntil = 0;
}

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
  const out: Pt[] = [];
  const key = (cx: number, cy: number) => `${cx},${cy}`;
  const seen = new Set<string>([key(x, y)]);
  const queue: Pt[] = [{ x, y }];
  const safe = (cx: number, cy: number) =>
    getCell(s.grid, cx, cy) === Cell.Floor &&
    !bombAt(s, cx, cy) &&
    !mineAt(s, cx, cy) &&
    flamesAt(s, cx, cy).length === 0 &&
    !s.enemies.some((e) => e.alive && Math.round(e.x) === cx && Math.round(e.y) === cy);
  while (queue.length && out.length < n) {
    const c = queue.shift()!;
    if (safe(c.x, c.y)) out.push(c);
    for (const d of DIRS) {
      const nx = c.x + DIR_VEC[d].x;
      const ny = c.y + DIR_VEC[d].y;
      if (!inBounds(s.grid, nx, ny) || seen.has(key(nx, ny)) || getCell(s.grid, nx, ny) !== Cell.Floor) continue;
      seen.add(key(nx, ny));
      queue.push({ x: nx, y: ny });
    }
  }
  return out;
}

// ───────────────────────────── queries ─────────────────────────────

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
        if (!inBounds(s.grid, x, y) || (x - px) ** 2 + (y - py) ** 2 > R * R) continue;
        const i = cellIndex(s.grid, x, y);
        const reg = adv.regionOf[i];
        if (reg >= 0 && adv.regions.find((q) => q.id === reg)?.unlocked) adv.explored[i] = 1;
      }
  }
}

/** Region id at a world position (-1 outside the live window). */
export function regionAt(s: GameState, x: number, y: number) {
  const adv = s.adventure;
  if (!adv) return -1;
  const cx = Math.round(x);
  const cy = Math.round(y);
  if (!inBounds(s.grid, cx, cy)) return -1;
  return adv.regionOf[cellIndex(s.grid, cx, cy)];
}

/** Live region by id. */
export const regionById = (s: GameState, id: number) => s.adventure?.regions.find((r) => r.id === id);
