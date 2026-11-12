import { ADVENTURE, BOSSES, Cell, CHARACTER_IDS, CHARACTERS, DIR_VEC, DIRS, POWERUPS, RULES, secToTicks, type BiomeId, type BossId, type CharacterId, type PowerupType } from '@4walls/shared';
import { spawnBoss } from './boss';
import { ELITE_MAGMITE_HP, wakeMimic } from './enemies';
import { EXPEDITION_LOSS, addCoins, applySnap, contractStep, snapPlayer } from './expedition';
import { addResident } from './camp';
import { cellIndex, createGrid, getCell, inBounds, setCell } from './grid';
import { nextRandom, pickWeighted, randInt } from './rng';
import type { AdventureState, CageState, EnemyState, GameState, GateState, Grid, PlayerState, PropState, RegionDir, RegionObjectiveKind, RegionState, RegionVariant } from './types';
import { bombAt, flamesAt, isPit, mineAt, newId, powerupAt } from './world';

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
  { name: 'Ponte de Obsidiana', chapter: 'O guardião', biome: 'transition', objective: 'seals' },
  { name: 'Câmara do Golem', chapter: 'O Golem desperta', biome: 'volcanic', objective: 'boss' },
  { name: 'Pouso da Fogueira', chapter: 'O descanso', biome: 'forest', objective: 'camp' },
  { name: 'Bosque Chamuscado', chapter: 'A corrupção', biome: 'forest', objective: 'purify' },
];

const NAME_PARTS: Record<BiomeId, { head: string[]; tail: string[] }> = {
  volcanic: {
    head: ['Vale', 'Cratera', 'Encosta', 'Planície', 'Fornalha', 'Garganta', 'Campos', 'Caldeirão', 'Escarpa', 'Bacia'],
    tail: ['das Brasas', 'de Cinza', 'do Enxofre', 'das Faíscas', 'de Basalto', 'da Lava Fria', 'do Fole', 'dos Rubis', 'das Fumaças', 'do Carvão'],
  },
  transition: {
    head: ['Ponte', 'Passagem', 'Fenda', 'Limiar', 'Desfiladeiro', 'Travessia', 'Garganta'],
    tail: ['de Obsidiana', 'do Vapor', 'das Raízes', 'da Ruptura', 'das Cinzas', 'dos Ecos', 'dos Véus'],
  },
  forest: {
    head: ['Bosque', 'Clareira', 'Mata', 'Trilha', 'Vereda', 'Grota', 'Brenha', 'Capoeira'],
    tail: ['Sussurrante', 'dos Ipês', 'das Sombras', 'do Fogo Antigo', 'do Cipó', 'das Corujas', 'dos Encantos', 'dos Vagalumes'],
  },
};
const CHAPTERS: Record<RegionObjectiveKind, string[]> = {
  clear: ['A limpeza', 'O cerco', 'A emboscada', 'A infestação', 'O enxame'],
  key: ['A chave perdida', 'O cadeado', 'A busca', 'O segredo do portão', 'A relíquia'],
  lever: ['A travessia', 'A ponte levadiça', 'O rio de fogo', 'A outra margem'],
  seals: ['O guardião', 'Os selos', 'A passagem selada', 'O abismo'],
  purify: ['A corrupção', 'Raízes podres', 'O bosque doente', 'A cura'],
  boss: ['O guardião desperta', 'O confronto', 'A prova do arco', 'O trono'],
  camp: ['O descanso', 'A fogueira', 'O pouso', 'A pausa'],
};
/** Camps: the first region of every arc after the first (right after a Guardian Chamber). */
const CAMP_NAMES = ['Pouso dos Viajantes', 'Clareira do Descanso', 'Refúgio das Brasas', 'Abrigo do Cipó', 'Acampamento da Lua', 'Fogueira dos Heróis', 'Pouso da Cinza'];
/** Names of the Guardian Chambers, by the boss that lives there. */
const CHAMBER_NAMES: Record<BossId, string[]> = {
  golem: ['Câmara do Golem', 'Forja do Golem', 'Trono de Magma', 'Coração da Caldeira', 'Salão de Basalto'],
  guardian: ['Covil do Guardião', 'Clareira do Guardião', 'Trono de Raízes', 'Santuário Antigo', 'Salão dos Troncos'],
};
// ───────────────────────────── arcs ─────────────────────────────

/**
 * The journey is a chain of arcs. Each arc has a dominant biome (volcanic and forest take turns)
 * and 5–7 regions: the biome's lands, a transition (obsidian, mist) toward the next biome, and the
 * Guardian Chamber where the arc's boss waits. Every full lap of the biome cycle (two arcs) comes
 * back with a new mood — night, mist or corruption — so region 40 never looks like region 4.
 */
export interface ArcInfo {
  index: number;
  /** First region of the arc and its number of regions. */
  start: number;
  length: number;
  biome: Exclude<BiomeId, 'transition'>;
  variant: RegionVariant;
  name: string;
}
const ARC_DOMINANT: ArcInfo['biome'][] = ['volcanic', 'forest'];
const VARIANTS: RegionVariant[] = ['night', 'mist', 'corrupted'];
const ARC_NAMES: Record<ArcInfo['biome'], string[]> = {
  volcanic: ['Terras de Brasa', 'As Fornalhas', 'O Coração de Magma', 'Os Campos Rubros', 'A Forja Antiga'],
  forest: ['A Mata Antiga', 'O Bosque Profundo', 'A Floresta dos Ecos', 'A Selva Sussurrante', 'A Mata dos Ipês'],
};
const VARIANT_SUFFIX: Record<RegionVariant, string> = { normal: '', night: 'à Noite', mist: 'na Névoa', corrupted: 'sob a Corrupção' };
/** Arc start indices per seed (grown on demand; deterministic). */
const arcStarts = new Map<number, number[]>();

export function arcInfo(seed: number, index: number): ArcInfo {
  const starts = arcStarts.get(seed) ?? [0];
  arcStarts.set(seed, starts);
  // The first arc is the scripted introduction: 3 volcanic regions, the Obsidian Bridge and the
  // Golem's chamber. Later arcs: 3–5 lands, the transition and the chamber.
  // Every arc after the first opens with a camp (Task 3), so they are one region longer.
  const lengthOf = (k: number) => (k === 0 ? 5 : 6 + randInt(subRng(seed, k, 11), 3));
  while (starts.length <= index + 1) starts.push(starts[starts.length - 1] + lengthOf(starts.length - 1));
  const biome = ARC_DOMINANT[index % 2];
  const lap = Math.floor(index / 2);
  // Lap 0 is the plain world; then the moods rotate so two arcs in a row never share one and
  // every biome meets every mood within three laps.
  const variant: RegionVariant = lap === 0 ? 'normal' : VARIANTS[(index - 2 + randInt(subRng(seed, 0, 13), 3)) % 3];
  const names = ARC_NAMES[biome];
  const base = names[(lap + randInt(subRng(seed, index, 14), names.length)) % names.length];
  return { index, start: starts[index], length: starts[index + 1] - starts[index], biome, variant, name: variant === 'normal' ? base : `${base} ${VARIANT_SUFFIX[variant]}` };
}

/** The arc region `id` belongs to and its position inside it. */
export function arcOfRegion(seed: number, id: number) {
  let k = 0;
  // Arcs are 5–7 long: start from a guess just under the answer and walk forward.
  for (k = Math.max(0, Math.floor(id / 8) - 1); ; k++) {
    const a = arcInfo(seed, k);
    if (id < a.start) {
      k = Math.max(0, k - 2);
      continue;
    }
    if (id < a.start + a.length) return { arc: a, pos: id - a.start, last: id === a.start + a.length - 1 };
  }
}

/** Boss of an arc's Guardian Chamber: the biome's own, a little stronger every time it comes back. */
export function arcBoss(seed: number, arc: number): { kind: BossId; level: number } {
  const a = arcInfo(seed, arc);
  // Volcanic and forest arcs take turns, so arc k meets its boss for the (k / 2)-th time.
  return { kind: a.biome === 'forest' ? 'guardian' : 'golem', level: Math.floor(arc / 2) };
}

/** Name, chapter, biome and objective of region `id`: cheap, needs no world generation. */
export function regionInfo(seed: number, id: number) {
  const { arc, last, pos } = arcOfRegion(seed, id);
  const variant = arc.variant;
  // The region right before the chamber is the transition (and the boss's warning).
  const bossNext = pos === arc.length - 2;
  if (id < SCRIPTED.length) return { ...SCRIPTED[id], variant, arc: arc.index, arcEnd: last, arcPos: pos, bossNext };
  const r = subRng(seed, id, 3);
  if (pos === 0 && arc.index >= 1) {
    // Task 3: the camp right after the previous arc's chamber.
    const name = CAMP_NAMES[randInt(r, CAMP_NAMES.length)];
    const chapter = CHAPTERS.camp[randInt(r, CHAPTERS.camp.length)];
    return { name, chapter, biome: arc.biome as BiomeId, objective: 'camp' as RegionObjectiveKind, variant, arc: arc.index, arcEnd: false, arcPos: pos, bossNext: false };
  }
  if (last) {
    // The Guardian Chamber: the boss's own hall, in the arc's biome.
    const names = CHAMBER_NAMES[arcBoss(seed, arc.index).kind];
    const name = names[randInt(r, names.length)];
    const chapter = CHAPTERS.boss[randInt(r, CHAPTERS.boss.length)];
    return { name, chapter, biome: arc.biome as BiomeId, objective: 'boss' as RegionObjectiveKind, variant, arc: arc.index, arcEnd: true, arcPos: pos, bossNext: false };
  }
  const biome: BiomeId = bossNext ? 'transition' : arc.biome;
  // A lava river cuts some regions in two (never in the forest): cross it and pull the lever.
  const roll = nextRandom(r);
  // Corrupted laps lean on the roots; the transition before the chamber is usually sealed.
  const special = nextRandom(r) < (bossNext ? 0.6 : variant === 'corrupted' ? 0.6 : 0.4);
  // Transition regions may be an obsidian causeway with seals; forests may be corrupted.
  const objective: RegionObjectiveKind =
    biome === 'transition' && special ? 'seals' : biome === 'forest' && special ? 'purify' : biome !== 'forest' && roll < 0.22 ? 'lever' : roll < 0.55 ? 'key' : 'clear';
  const parts = NAME_PARTS[biome];
  const name = `${parts.head[randInt(r, parts.head.length)]} ${parts.tail[randInt(r, parts.tail.length)]}`;
  const chapter = CHAPTERS[objective][randInt(r, CHAPTERS[objective].length)];
  return { name, chapter, biome, objective, variant, arc: arc.index, arcEnd: false, arcPos: pos, bossNext };
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

/**
 * Difficulty of one region: the depth curve plus the arc's rhythm. The first region of an arc is
 * a breather (one Magmito fewer), the transition before the chamber is tense (one more), and a
 * corrupted lap adds one more on top. The chamber itself only has its boss.
 */
export function regionDifficulty(seed: number, id: number) {
  const d = difficulty(id);
  if (id < SCRIPTED.length) return d;
  const info = regionInfo(seed, id);
  // The first land of the arc (right after the camp) is the breather.
  const delta = (info.arcPos === (info.arc >= 1 ? 1 : 0) ? -1 : 0) + (info.bossNext ? 1 : 0) + (info.variant === 'corrupted' ? 1 : 0);
  return { ...d, enemies: Math.max(2, Math.min(ADVENTURE.enemiesCap, d.enemies + delta)) };
}

export type RegionShape = 'island' | 'plaza' | 'river' | 'causeway' | 'ring' | 'twin' | 'longbridge' | 'arena' | 'camp';

/** Map mechanics of a region: shape, Fagulhas, ash vents, the braziers side mission. */
export interface RegionMods {
  /**
   * island: the noisy ellipse; plaza: flower beds around a crossroads; river: lava band + lever;
   * causeway: walkway over a chasm; ring: a pit in the middle, the fight goes around it; twin: two
   * islands joined by one narrow bridge; longbridge: two banks over a wide pit, two long bridges;
   * arena: the Guardian Chamber, an open hall with four pillars (two are Totems of Return).
   */
  shape: RegionShape;
  sparks: number;
  vents: number;
  braziers: boolean;
  /** Dry grass patches (forest): they catch fire and spread it. */
  grass: number;
}

export function regionMods(seed: number, id: number): RegionMods {
  const enemies = regionDifficulty(seed, id).enemies;
  const scripted: (Omit<RegionMods, 'grass'> | undefined)[] = [
    { shape: 'island', sparks: 0, vents: 0, braziers: false }, // O despertar: just the basics
    { shape: 'plaza', sparks: 2, vents: 2, braziers: true }, // A infestação: everything new at once
    { shape: 'island', sparks: 2, vents: 1, braziers: false },
    { shape: 'plaza', sparks: 2, vents: 1, braziers: true },
    { shape: 'arena', sparks: 0, vents: 0, braziers: false }, // the Golem's chamber
    { shape: 'camp', sparks: 0, vents: 0, braziers: false }, // the first camp
    { shape: 'island', sparks: 1, vents: 0, braziers: false },
  ];
  const info = regionInfo(seed, id);
  if (info.objective === 'boss') return { shape: 'arena', sparks: 0, vents: 0, braziers: false, grass: 0 };
  if (info.objective === 'camp') return { shape: 'camp', sparks: 0, vents: 0, braziers: false, grass: 0 };
  const river = info.objective === 'lever';
  const shapeFor = info.objective === 'seals' ? ('causeway' as const) : river ? ('river' as const) : null;
  const grass = info.biome === 'forest' ? 2 + (id > 8 ? 1 : 0) : 0;
  if (scripted[id]) return { ...scripted[id]!, ...(shapeFor ? { shape: shapeFor, braziers: false } : {}), grass, sparks: Math.min(scripted[id]!.sparks, enemies - 1) };
  const r = subRng(seed, id, 5);
  const biome = regionInfo(seed, id).biome;
  const shapeRoll = nextRandom(r);
  // New shapes join gradually; the long bridges only once players know about pits.
  const shape: RegionShape =
    shapeFor ??
    (shapeRoll < 0.24 ? 'plaza' : shapeRoll < 0.4 ? 'ring' : shapeRoll < 0.56 ? 'twin' : shapeRoll < 0.68 && id >= 8 ? 'longbridge' : 'island');
  return {
    shape,
    // Fagulhas take a growing share of the Magmitos as the journey goes on.
    sparks: Math.min(enemies - 1, Math.floor(enemies * Math.min(0.5, 0.15 + 0.03 * (id - 5)))),
    vents: biome === 'forest' ? 0 : nextRandom(r) < 0.55 ? 1 + randInt(r, 2) : 0,
    braziers: !shapeFor && shape !== 'longbridge' && info.objective !== 'purify' && nextRandom(r) < 0.4,
    grass,
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
  /** B4: elites among the region's enemies (the last spots). */
  elites: ('magmite' | 'spark')[];
}

/** Builds region `id` deterministically from the seed (chain must reach id + 1). */
function regionBlueprint(seed: number, adv: AdventureState, id: number): Blueprint {
  const info = regionInfo(seed, id);
  if (info.objective === 'boss') return chamberBlueprint(seed, adv, id, info);
  if (info.objective === 'camp') return campBlueprint(seed, adv, id, info);
  const diff = regionDifficulty(seed, id);
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

  // 2c. Obsidian causeway: a walkway three cells wide along the paths, a few side pockets, and a
  // bottomless chasm everywhere else on the island.
  const pockets: Pt[] = [];
  if (mods.shape === 'causeway') {
    const path = [...corridor].map((i) => ({ x: ox + (i % CW), y: oy + Math.floor(i / CW) }));
    const closeTo = (a: Pt | null, x: number, y: number, d: number) => !!a && Math.abs(a.x - x) + Math.abs(a.y - y) <= d;
    const along = path.filter((c) => !closeTo(exit, c.x, c.y, 3) && !closeTo(entry, c.x, c.y, 3) && !(c.x === center.x && c.y === center.y));
    for (let tries = 0; tries < 40 && pockets.length < 3 && along.length; tries++) {
      const c = along[randInt(r, along.length)];
      // Sideways from the path (the path runs along a row or a column).
      const horizontalPath = corridor.has(at(c.x + 1, c.y)) || corridor.has(at(c.x - 1, c.y));
      const side = nextRandom(r) < 0.5 ? -1 : 1;
      const pc = horizontalPath ? { x: c.x, y: c.y + 3 * side } : { x: c.x + 3 * side, y: c.y };
      if (pc.x <= ox + 1 || pc.y <= oy + 1 || pc.x >= ox + CW - 2 || pc.y >= oy + CH - 2) continue;
      if (!island[at(pc.x, pc.y)] || pockets.some((q) => Math.abs(q.x - pc.x) + Math.abs(q.y - pc.y) < 4)) continue;
      pockets.push(pc);
    }
    const nearPath = (x: number, y: number) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (corridor.has(at(x + dx, y + dy)) && inChunk(x + dx, y + dy)) return true;
      return false;
    };
    const inPocket = (x: number, y: number) => pockets.some((q) => Math.abs(q.x - x) <= 1 && Math.abs(q.y - y) <= 1) || pockets.some((q) => (q.x === x && Math.abs(q.y - y) <= 2) || (q.y === y && Math.abs(q.x - x) <= 2));
    for (let y = oy; y < oy + CH; y++)
      for (let x = ox; x < ox + CW; x++) {
        if (!island[at(x, y)] || nearPath(x, y)) continue;
        if (inPocket(x, y)) {
          set(x, y, Cell.Floor);
          continue;
        }
        set(x, y, Cell.Chasm);
      }
    for (const q of pockets) corridor.add(at(q.x, q.y));
  }

  // 2d. Extra shapes, cut with the biome's pit: lava in volcanic lands, a chasm elsewhere.
  const pitCell = info.biome === 'volcanic' ? Cell.Lava : Cell.Chasm;
  const pit = (x: number, y: number) => {
    if (!island[at(x, y)]) return;
    set(x, y, pitCell);
    corridor.delete(at(x, y));
  };
  const bridge = (x: number, y: number) => {
    set(x, y, Cell.Floor);
    corridor.add(at(x, y));
  };
  if (mods.shape === 'ring') {
    // A pit in the middle: the corridors stop at its rim and the fight circles around it.
    for (let y = oy; y < oy + CH; y++)
      for (let x = ox; x < ox + CW; x++) {
        const dx = (x - (ox + 7)) / 2.3;
        const dy = (y - (oy + 7)) / 1.6;
        if (dx * dx + dy * dy <= 1) pit(x, y);
      }
  } else if (mods.shape === 'twin') {
    // Two islands: a two-cell gap (too wide to jump) crossed by the middle row only.
    for (let y = oy; y < oy + CH; y++) for (const x of [ox + 9, ox + 10]) if (y !== oy + 7) pit(x, y);
    for (const x of [ox + 9, ox + 10]) bridge(x, oy + 7);
  } else if (mods.shape === 'longbridge') {
    // Two banks over a six-cell pit: the middle row and one more row are long, narrow bridges.
    const band = [5, 6, 7, 8, 9, 10].map((k) => ox + k);
    const rows = [oy + 3, oy + 11, oy + 5, oy + 9].filter((y) => island[at(ox + 4, y)] && island[at(ox + 11, y)]);
    const second = rows.length ? rows[randInt(r, Math.min(2, rows.length))] : null;
    for (let y = oy; y < oy + CH; y++) for (const x of band) if (!corridor.has(at(x, y))) pit(x, y);
    for (const x of band) {
      bridge(x, oy + 7);
      if (second !== null) bridge(x, second);
    }
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
      if (isPit(get(nx, ny) as Cell) && !riverPlan?.crossings.has(at(nx, ny))) continue;
      dist.set(at(nx, ny), dist.get(at(c.x, c.y))! + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  const reachable = (x: number, y: number) => dist.has(at(x, y));
  const candidates = (pred: (x: number, y: number) => boolean) => {
    const out: Pt[] = [];
    for (let y = oy; y < oy + CH; y++) for (let x = ox; x < ox + CW; x++) if (reachable(x, y) && !reserved(x, y) && !isPit(get(x, y) as Cell) && pred(x, y)) out.push({ x, y });
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

  // Pillar-like props (seals, roots) may never cut the island in two.
  const reachableAll = () => {
    const seen = new Set<number>([at(start.x, start.y)]);
    const q: Pt[] = [start];
    while (q.length) {
      const c = q.shift()!;
      for (const d of DIRS) {
        const nx = c.x + DIR_VEC[d].x;
        const ny = c.y + DIR_VEC[d].y;
        const cell = get(nx, ny);
        if (!inChunk(nx, ny) || cell === Cell.Wall || isPit(cell as Cell) || seen.has(at(nx, ny))) continue;
        seen.add(at(nx, ny));
        q.push({ x: nx, y: ny });
      }
    }
    return seen.size;
  };
  const placePillars = (n: number, minDist: number, spots: Pt[]) => {
    const picked: Pt[] = [];
    let base = reachableAll();
    for (let tries = 0; tries < 80 && picked.length < n && spots.length; tries++) {
      const c = spots[randInt(r, spots.length)];
      if (!picked.every((q) => Math.abs(q.x - c.x) + Math.abs(q.y - c.y) >= minDist)) continue;
      const before = get(c.x, c.y);
      set(c.x, c.y, Cell.Wall);
      if (reachableAll() !== base - 1) {
        set(c.x, c.y, before as Cell);
        continue;
      }
      base -= 1;
      picked.push(c);
      taken.push(c);
    }
    return picked;
  };

  // 10b. Obsidian seals (objective): one in each causeway pocket, the rest wherever they fit.
  if (info.objective === 'seals') {
    const seals: Pt[] = [];
    for (const q of pockets) {
      set(q.x, q.y, Cell.Wall);
      taken.push(q);
      seals.push(q);
    }
    if (seals.length < 3) seals.push(...placePillars(3 - seals.length, 4, candidates((x, y) => get(x, y) === Cell.Floor && free(x, y))));
    for (const c of seals) props.push({ id: propId(), kind: 'seal', region: id, x: c.x, y: c.y, state: 'intact', hp: 3 });
  }

  // 10c. Corrupted roots (objective) and the brambles they keep regrowing.
  if (info.objective === 'purify') {
    const roots = placePillars(3, 5, candidates((x, y) => get(x, y) === Cell.Floor && free(x, y) && !near(start, x, y, 4)));
    for (const c of roots) props.push({ id: propId(), kind: 'root', region: id, x: c.x, y: c.y, state: 'intact', hp: 3 });
    for (let y = oy; y < oy + CH; y++)
      for (let x = ox; x < ox + CW; x++)
        if (get(x, y) === Cell.Block && nextRandom(r) < 0.45 && free(x, y)) props.push({ id: propId(), kind: 'bramble', region: id, x, y, state: 'grown' });
  }

  // 10d. Dry grass patches: walkable tufts that catch fire from a blast and spread it.
  for (let g = 0; g < mods.grass; g++) {
    const seeds = candidates((x, y) => get(x, y) === Cell.Floor && free(x, y) && !near(start, x, y, 3));
    if (!seeds.length) break;
    const patch: Pt[] = [seeds[randInt(r, seeds.length)]];
    for (let k = 0; k < 12 && patch.length < 5; k++) {
      const from = patch[randInt(r, patch.length)];
      const d = DIRS[randInt(r, 4)];
      const c = { x: from.x + DIR_VEC[d].x, y: from.y + DIR_VEC[d].y };
      if (get(c.x, c.y) !== Cell.Floor || reserved(c.x, c.y) || !free(c.x, c.y) || patch.some((q) => q.x === c.x && q.y === c.y)) continue;
      patch.push(c);
    }
    for (const c of patch) props.push({ id: propId(), kind: 'grass', region: id, x: c.x, y: c.y, state: 'dry' });
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
    arc: info.arc,
    variant: info.variant,
    arcEnd: info.arcEnd,
    cx,
    cy,
    objective: {
      kind: info.objective,
      progress: 0,
      goal: info.objective === 'clear' ? diff.enemies : info.objective === 'seals' ? props.filter((p) => p.kind === 'seal').length : info.objective === 'purify' ? props.filter((p) => p.kind === 'root').length : 1,
      done: false,
    },
    unlocked: id === 0,
    cleared: false,
    entry,
  };
  const exitGate: GateState = { id, x: exit.x, y: exit.y, axis: exitDir === 'E' ? 'h' : 'v', from: id, to: id + 1, open: false, openedTick: -1, kind: 'exit' };
  // B4: from the second arc on, one chest in some regions is a Mimic (more under the corruption).
  // Its own random stream, so the rest of the region stays as it was.
  const mr = subRng(seed, id, 21);
  const chests = props.filter((p) => p.kind === 'chest');
  if (info.arc >= 1 && chests.length && nextRandom(mr) < (info.variant === 'corrupted' ? 0.55 : 0.22)) chests[randInt(mr, chests.length)].mimic = true;
  return { state, cells, ox, oy, exitGate, spawns, cage, props, enemySpots, enemyCount: diff.enemies, enemySpeed: diff.enemySpeed, sparks: mods.sparks, elites: elitesFor(seed, id) };
}

/** Pillars of the chamber, relative to the chunk (symmetric around the hall's middle). */
/** Where the Guardian's support roots may grow (chunk-relative), well away from its bed. */
const CHAMBER_ROOTS: Pt[] = [
  { x: 7, y: 2 },
  { x: 2, y: 6 },
  { x: 13, y: 6 },
  { x: 7, y: 11 },
  { x: 3, y: 2 },
  { x: 12, y: 2 },
  { x: 3, y: 11 },
  { x: 12, y: 11 },
  { x: 2, y: 9 },
  { x: 13, y: 9 },
];

const CHAMBER_PILLARS: Pt[] = [
  { x: 4, y: 4 },
  { x: 11, y: 4 },
  { x: 4, y: 10 },
  { x: 11, y: 10 },
];

/**
 * The Guardian Chamber: an open hall so the boss's 3×3 body can roam (no grid pillars), four
 * pillars for cover — two of them Totems of Return — and a few crates for power-ups. The boss
 * sleeps in the middle until the whole group is in and the gate behind them seals.
 */
function chamberBlueprint(seed: number, adv: AdventureState, id: number, info: ReturnType<typeof regionInfo>): Blueprint {
  const r = subRng(seed, id, 2);
  const { cx, cy } = chunkOf(adv, id);
  const ox = cx * CW;
  const oy = cy * CH;
  const cells = new Uint8Array(CW * CH).fill(Cell.Wall);
  const at = (x: number, y: number) => (y - oy) * CW + (x - ox);
  const set = (x: number, y: number, c: Cell) => {
    if (x >= ox && y >= oy && x < ox + CW && y < oy + CH) cells[at(x, y)] = c;
  };
  const get = (x: number, y: number) => cells[at(x, y)];
  // The hall: the whole chunk inside its rim, with the corners rounded off.
  for (let y = oy + 1; y < oy + CH - 1; y++)
    for (let x = ox + 1; x < ox + CW - 1; x++) {
      const ex = Math.min(x - (ox + 1), ox + CW - 2 - x);
      const ey = Math.min(y - (oy + 1), oy + CH - 2 - y);
      if (ex + ey >= 2) set(x, y, Cell.Floor);
    }
  const exitDir = adv.dirs[id];
  const exit = edgeCell(ox, oy, exitDir);
  const entry = id > 0 ? edgeCell(ox, oy, opposite(adv.dirs[id - 1])) : null;
  if (entry) set(entry.x, entry.y, Cell.Floor);
  set(exit.x, exit.y, Cell.Wall); // sealed until the boss falls
  const center = { x: ox + 7, y: oy + 7 };
  // Pillars; one diagonal pair are the Totems of Return.
  const flip = nextRandom(r) < 0.5;
  const totems = (flip ? [0, 3] : [1, 2]).map((i) => ({ x: ox + CHAMBER_PILLARS[i].x, y: oy + CHAMBER_PILLARS[i].y }));
  for (const p of CHAMBER_PILLARS) set(ox + p.x, oy + p.y, Cell.Wall);
  // A few crates: never on the boss's bed, the doorways or right beside a totem.
  const near = (a: Pt | null, x: number, y: number, d: number) => !!a && Math.abs(a.x - x) + Math.abs(a.y - y) <= d;
  for (let y = oy + 1; y < oy + CH - 1; y++)
    for (let x = ox + 1; x < ox + CW - 1; x++) {
      if (get(x, y) !== Cell.Floor) continue;
      if (Math.max(Math.abs(x - center.x), Math.abs(y - center.y)) <= 2 || near(entry, x, y, 3) || near(exit, x, y, 2)) continue;
      if (totems.some((t) => near(t, x, y, 1))) continue;
      if (nextRandom(r) < 0.12) set(x, y, Cell.Block);
    }
  let propSeq = 0;
  const props: Omit<PropState, 'tick'>[] = totems.map((t) => ({ id: id * 64 + propSeq++, kind: 'totem' as const, region: id, x: t.x, y: t.y, state: 'idle' as const }));
  // The Guardian's hall: three support roots spread around it, and brambles that regrow while they live.
  if (arcBoss(seed, info.arc).kind === 'guardian') {
    const spots = CHAMBER_ROOTS.map((p) => ({ x: ox + p.x, y: oy + p.y })).filter(
      (p) => !near(entry, p.x, p.y, 3) && !near(exit, p.x, p.y, 3) && !totems.some((t) => near(t, p.x, p.y, 1)),
    );
    const roots: Pt[] = [];
    while (roots.length < 3 && spots.length) {
      const pick = spots.splice(randInt(r, spots.length), 1)[0];
      if (roots.every((q) => Math.abs(q.x - pick.x) + Math.abs(q.y - pick.y) >= 6)) roots.push(pick);
    }
    for (const c of roots) {
      set(c.x, c.y, Cell.Wall);
      props.push({ id: id * 64 + propSeq++, kind: 'root', region: id, x: c.x, y: c.y, state: 'intact', hp: 3 });
    }
    for (let y = oy + 1; y < oy + CH - 1; y++)
      for (let x = ox + 1; x < ox + CW - 1; x++)
        if (get(x, y) === Cell.Block && nextRandom(r) < 0.6) props.push({ id: id * 64 + propSeq++, kind: 'bramble', region: id, x, y, state: 'grown' });
  }
  const state: RegionState = {
    id,
    name: info.name,
    chapter: info.chapter,
    biome: info.biome,
    arc: info.arc,
    variant: info.variant,
    arcEnd: true,
    cx,
    cy,
    objective: { kind: 'boss', progress: 0, goal: 1, done: false },
    unlocked: id === 0,
    cleared: false,
    entry,
  };
  const exitGate: GateState = { id, x: exit.x, y: exit.y, axis: exitDir === 'E' ? 'h' : 'v', from: id, to: id + 1, open: false, openedTick: -1, kind: 'exit' };
  return { state, cells, ox, oy, exitGate, spawns: [], cage: null, props, enemySpots: [], enemyCount: 0, enemySpeed: 1, sparks: 0, elites: [] };
}

/**
 * Task 3 — a camp: a quiet clearing with a campfire in the middle. No enemies. The way on opens
 * once the whole group has gathered at the fire, which saves the expedition.
 */
function campBlueprint(seed: number, adv: AdventureState, id: number, info: ReturnType<typeof regionInfo>): Blueprint {
  const r = subRng(seed, id, 2);
  const { cx, cy } = chunkOf(adv, id);
  const ox = cx * CW;
  const oy = cy * CH;
  const cells = new Uint8Array(CW * CH).fill(Cell.Wall);
  const at = (x: number, y: number) => (y - oy) * CW + (x - ox);
  const set = (x: number, y: number, c: Cell) => {
    if (x >= ox && y >= oy && x < ox + CW && y < oy + CH) cells[at(x, y)] = c;
  };
  const center = campfireOf({ cx, cy });
  // An oval clearing.
  for (let y = oy + 1; y < oy + CH - 1; y++)
    for (let x = ox + 1; x < ox + CW - 1; x++) {
      const dx = (x - center.x) / 6.6;
      const dy = (y - center.y) / 5.6;
      if (dx * dx + dy * dy <= 1) set(x, y, Cell.Floor);
    }
  const exitDir = adv.dirs[id];
  const exit = edgeCell(ox, oy, exitDir);
  const entry = id > 0 ? edgeCell(ox, oy, opposite(adv.dirs[id - 1])) : null;
  // Paths from the doorways into the clearing (kept clear all the way to the fire).
  const paths = new Set<number>();
  for (const d of [entry, exit]) {
    if (!d) continue;
    let x = d.x;
    let y = d.y;
    for (let guard = 0; guard < CW + CH; guard++) {
      set(x, y, Cell.Floor);
      paths.add(at(x, y));
      if (x === center.x && y === center.y) break;
      if (x !== center.x) x += Math.sign(center.x - x);
      else y += Math.sign(center.y - y);
    }
  }
  set(exit.x, exit.y, Cell.Wall); // opens when the fire is lit
  // A few trees around the edge for shade (never on the paths or by the fire).
  for (let k = 0; k < 4; k++) {
    const x = ox + 2 + randInt(r, CW - 4);
    const y = oy + 2 + randInt(r, CH - 4);
    if (Math.abs(x - center.x) + Math.abs(y - center.y) < 4) continue;
    if ((entry && Math.abs(x - entry.x) + Math.abs(y - entry.y) < 4) || Math.abs(x - exit.x) + Math.abs(y - exit.y) < 4) continue;
    if (cells[at(x, y)] === Cell.Floor && x !== center.x && y !== center.y) set(x, y, Cell.Wall);
  }
  set(center.x, center.y, Cell.Wall); // the fire stands like a pillar
  const props: Omit<PropState, 'tick'>[] = [{ id: id * 64, kind: 'campfire', region: id, x: center.x, y: center.y, state: 'unlit' }];
  // Tents of the residents, in a ring around the fire (never on the paths in and out).
  const TENTS: [number, number, string][] = [[-3, -3, 'shop'], [3, -3, 'smith'], [-5, 0, 'cook'], [5, 0, 'scout'], [-3, 3, 'contract'], [3, 3, 'wheel']];
  let tentSeq = 1;
  for (const [dx, dy, service] of TENTS) {
    const x = center.x + dx;
    const y = center.y + dy;
    if (paths.has(at(x, y)) || cells[at(x, y)] !== Cell.Floor) continue;
    set(x, y, Cell.Wall);
    props.push({ id: id * 64 + tentSeq++, kind: 'tent', region: id, x, y, state: 'idle', service });
  }
  const spawns = [
    { x: center.x - 2, y: center.y },
    { x: center.x + 2, y: center.y },
    { x: center.x, y: center.y + 2 },
    { x: center.x, y: center.y - 2 },
  ];
  for (const sp of spawns) set(sp.x, sp.y, Cell.Floor);
  const state: RegionState = {
    id,
    name: info.name,
    chapter: info.chapter,
    biome: info.biome,
    arc: info.arc,
    variant: info.variant,
    arcEnd: false,
    cx,
    cy,
    objective: { kind: 'camp', progress: 0, goal: 1, done: false },
    unlocked: id === 0,
    cleared: false,
    entry,
  };
  const exitGate: GateState = { id, x: exit.x, y: exit.y, axis: exitDir === 'E' ? 'h' : 'v', from: id, to: id + 1, open: false, openedTick: -1, kind: 'exit' };
  return { state, cells, ox, oy, exitGate, spawns, cage: null, props, enemySpots: [], enemyCount: 0, enemySpeed: 1, sparks: 0, elites: [] };
}

/** The campfire in the middle of a camp. */
export const campfireOf = (reg: { cx: number; cy: number }) => ({ x: reg.cx * CW + 7, y: reg.cy * CH + 7 });

/** Where the chamber's boss sleeps (the hall's middle). */
export const chamberCenter = (reg: { cx: number; cy: number }) => ({ x: reg.cx * CW + 7, y: reg.cy * CH + 7 });

/** Health multipliers by group size: more players, more health (not linear). */
const BOSS_HP_BY_PLAYERS = [1, 1.5, 1.9, 2.2];

/** The group is in and the way back sealed: the chamber's boss wakes up. */
function wakeGuardian(s: GameState, reg: RegionState) {
  const { kind, level } = arcBoss(s.config.seed, reg.arc);
  const players = Math.max(1, Math.min(4, s.players.filter((p) => !p.left).length));
  // The very first one is a gentle introduction; every comeback is tougher (capped).
  const levelMul = level === 0 ? 0.8 : Math.min(3, 1 + 0.3 * level);
  const hp = Math.max(6, Math.round(BOSSES[kind].hp * BOSS_HP_BY_PLAYERS[players - 1] * levelMul));
  const c = chamberCenter(reg);
  const arena = { x0: reg.cx * CW + 1, y0: reg.cy * CH + 1, x1: reg.cx * CW + CW - 2, y1: reg.cy * CH + CH - 2 };
  spawnBoss(s, kind, { x: c.x, y: c.y, regionId: reg.id, level, hp, speedMul: Math.min(1.4, 1 + 0.06 * level), arena, ...(reg.variant !== 'normal' ? { mod: reg.variant } : {}) });
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

/**
 * B4 elites: none in the first arc; then one per region, two deep in the journey or under the
 * corruption (never three). Each is a big Magmito (3 HP) or a Fagulha that splits when it dies.
 */
export function elitesFor(seed: number, id: number): ('magmite' | 'spark')[] {
  const info = regionInfo(seed, id);
  if (info.arc < 1 || info.objective === 'boss' || info.objective === 'camp' || id < SCRIPTED.length) return [];
  const r = subRng(seed, id, 22);
  const n = Math.min(2, 1 + (id >= 18 ? 1 : 0) + (info.variant === 'corrupted' ? 1 : 0));
  return Array.from({ length: n }, () => (nextRandom(r) < 0.5 ? 'magmite' : 'spark'));
}

/** Puts the region's enemies in place (the first spots get Fagulhas, the last ones elites) and sets the clear goal. */
function populate(s: GameState, bp: Blueprint) {
  const id = bp.state.id;
  const n = Math.min(bp.enemyCount, bp.enemySpots.length);
  const elites = bp.elites.slice(0, Math.max(0, n - 1));
  for (let k = 0; k < n; k++) {
    const c = bp.enemySpots[k];
    const ek = n - 1 - k < elites.length ? elites[n - 1 - k] : null;
    const spark = ek ? ek === 'spark' : k < bp.sparks;
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
      speedMul: ek === 'magmite' ? bp.enemySpeed * 0.85 : bp.enemySpeed,
      ...(spark ? { mode: 'wander' as const, modeUntil: 0 } : {}),
      ...(ek ? { elite: true, ...(ek === 'magmite' ? { hp: ELITE_MAGMITE_HP } : {}) } : {}),
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
  s.meteors = s.meteors.filter((m) => !inside(m.x, m.y));
  if (s.boss?.regionId === id) s.boss = null;
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

/**
 * Initial state: regions `from` and `from + 1` (the second one visible behind the first gate).
 * `from` > 0 resumes an expedition at a camp: the world is the same (it all comes from the seed).
 */
export function createAdventure(seed: number, from = 0): { grid: Grid; adventure: AdventureState; spawns: Pt[] } {
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
  const bp = attachRegion(s, from, false)!;
  attachRegion(s, from + 1, false);
  adventure.depth = from;
  adventure.regions.find((r) => r.id === from)!.unlocked = true;
  // Nothing behind a resumed camp: its doorway is sealed like any region left behind.
  const entry = adventure.regions.find((r) => r.id === from)!.entry;
  if (from > 0 && entry) {
    setCell(s.grid, entry.x, entry.y, Cell.Wall);
    const prevDir = adventure.dirs[from - 1];
    adventure.gates.push({ id: 1_000_000 + from, x: entry.x, y: entry.y, axis: prevDir === 'E' ? 'h' : 'v', from: from - 1, to: from, open: false, openedTick: -1, kind: 'back' });
  }
  const first = regionInfo(seed, from);
  adventure.journey.push({ id: from, name: first.name, biome: first.biome, variant: first.variant, arc: first.arc });
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
  updateObsidianAndForest(s);
  updateLavaFalls(s);
  updateCages(s);
  updateProps(s);
  updateObjectives(s);
  updateProgress(s);
  updateFall(s);
}

// ───────────────────────────── Task 3: the expedition ─────────────────────────────

/** Seconds between the whole group falling and waking at the last camp. */
export const FALL_SEC = 2.5;

/** The whole group down: a moment later they wake at the last camp (half the purse lost). */
function updateFall(s: GameState) {
  const ex = s.expedition;
  if (!ex || ex.ended) return;
  const present = s.players.filter((p) => !p.left);
  const down = present.length > 0 && present.every((p) => !p.alive);
  if (!down) {
    ex.fallAt = undefined;
    return;
  }
  if (ex.fallAt === undefined) {
    ex.fallAt = s.tick + secToTicks(FALL_SEC);
    s.events.push({ type: 'groupFell', atTick: ex.fallAt, camp: ex.camp });
    return;
  }
  if (s.tick >= ex.fallAt) returnToCamp(s);
}

/** Back to the last campfire: same world (same seed), the heroes as they were there. */
export function returnToCamp(s: GameState) {
  const ex = s.expedition!;
  const lost = Math.floor(ex.coins * EXPEDITION_LOSS);
  ex.coins -= lost;
  if (ex.contract?.kind === 'clean') {
    s.events.push({ type: 'contractFailed', kind: 'clean' });
    ex.contract = null;
  }
  ex.returns++;
  ex.fallAt = undefined;
  const journey = s.adventure!.journey;
  const fresh = createAdventure(s.config.seed, ex.camp);
  fresh.adventure.journey = journey;
  s.adventure = fresh.adventure;
  s.grid = fresh.grid;
  s.enemies = [];
  s.bombs = [];
  s.flames = [];
  s.powerups = [];
  s.mines = [];
  s.meteors = [];
  s.boss = null;
  for (const p of s.players) {
    if (p.left) continue;
    const sp = fresh.spawns[p.slot % Math.max(1, fresh.spawns.length)] ?? fresh.spawns[0];
    applySnap(p, ex.snapshot.find((q) => q.slot === p.slot));
    Object.assign(p, {
      alive: true,
      x: sp.x,
      y: sp.y,
      px: sp.x,
      py: sp.y,
      moving: false,
      slideDir: null,
      maneuver: null,
      frozenUntil: 0,
      ghostUntil: 0,
      turboUntil: 0,
      passBombs: [],
      diedTick: -1,
      invulnUntil: s.tick + secToTicks(REVIVE_INVULN_SEC),
    });
  }
  spawnAdventureEnemies(s);
  revealAround(s);
  s.events.push({ type: 'campReturn', region: ex.camp, lost });
}

/** A lit campfire within reach of a player (camps only). */
const fireNear = (s: GameState, p: PlayerState) =>
  s.adventure?.props.find((q) => q.kind === 'campfire' && q.state === 'lit' && Math.abs(q.x - p.x) + Math.abs(q.y - p.y) <= 3.2);

/** The vault: carried coins go into it at a lit fire and are never lost again. */
export function tryBankCoins(s: GameState, p: PlayerState) {
  const ex = s.expedition;
  if (!ex || ex.ended || ex.coins <= 0 || !fireNear(s, p)) return false;
  const amount = ex.coins;
  ex.banked = (ex.banked ?? 0) + amount;
  ex.coins = 0;
  s.events.push({ type: 'coinsBanked', byId: p.id, amount, banked: ex.banked });
  return true;
}

/** A player at a lit campfire ends the expedition: everything carried is kept. */
export function tryEndExpedition(s: GameState, p: PlayerState) {
  const ex = s.expedition;
  if (!ex || ex.ended || !s.adventure) return false;
  if (!fireNear(s, p)) return false;
  ex.ended = true;
  s.events.push({ type: 'expeditionEnded', byId: p.id, coins: ex.coins });
  return true;
}

/** The whole group gathered at a camp's fire: it lights, saves the expedition and opens the way. */
function updateCampfire(s: GameState, pr: PropState) {
  const ex = s.expedition;
  const living = s.players.filter((p) => p.alive && !p.left);
  if (!living.length) return;
  if (!living.every((p) => regionAt(s, p.x, p.y) === pr.region && Math.abs(p.x - pr.x) + Math.abs(p.y - pr.y) <= 4.2)) return;
  pr.state = 'lit';
  pr.tick = s.tick;
  let again = true;
  if (ex?.contract && pr.region >= ex.contract.until) {
    const c = ex.contract;
    ex.contract = null;
    if (c.kind === 'clean') {
      addCoins(s, c.reward, pr.x, pr.y);
      s.events.push({ type: 'contractDone', kind: c.kind, reward: c.reward });
    } else s.events.push({ type: 'contractFailed', kind: c.kind });
  }
  if (ex) {
    again = ex.camp === pr.region;
    if (!again) ex.camps++;
    ex.camp = pr.region;
    // Fallen allies are brought back by the gate as usual; the save remembers the living ones.
    ex.snapshot = s.players.filter((p) => !p.left).map((p) => (p.alive ? snapPlayer(p) : ex.snapshot.find((q) => q.slot === p.slot) ?? snapPlayer(p)));
  }
  s.events.push({ type: 'campLit', region: pr.region, x: pr.x, y: pr.y, again });
}

function updateObjectives(s: GameState) {
  const adv = s.adventure!;
  for (const r of adv.regions) {
    if (r.cleared || !r.unlocked) continue;
    const o = r.objective;
    let progress = o.progress;
    if (o.kind === 'clear') progress = Math.max(0, o.goal - s.enemies.filter((e) => e.alive && e.regionId === r.id && e.kind !== 'mimic').length);
    else if (o.kind === 'key') progress = adv.props.some((p) => p.kind === 'key' && p.region === r.id && p.state === 'used') ? 1 : 0;
    else if (o.kind === 'lever') progress = adv.props.some((p) => p.kind === 'lever' && p.region === r.id && p.state === 'on') ? 1 : 0;
    else if (o.kind === 'seals') progress = adv.props.filter((p) => p.kind === 'seal' && p.region === r.id && p.state === 'broken').length;
    else if (o.kind === 'purify') progress = adv.props.filter((p) => p.kind === 'root' && p.region === r.id && p.state === 'broken').length;
    else if (o.kind === 'camp') progress = adv.props.some((p) => p.kind === 'campfire' && p.region === r.id && p.state === 'lit') ? 1 : 0;
    else if (o.kind === 'boss') {
      // Set by the boss itself when it falls (boss.ts).
      if (o.progress < o.goal) continue;
      progress = o.progress;
    }
    if (progress !== o.progress) {
      o.progress = progress;
      s.events.push({ type: 'objectiveProgress', region: r.id, progress, goal: o.goal });
    }
    if (progress < o.goal) continue;
    o.done = true;
    r.cleared = true;
    s.events.push({ type: 'regionCleared', region: r.id, arcEnd: r.arcEnd, bossNext: regionInfo(s.config.seed, r.id + 1).objective === 'boss' });
    // Every region crossed pays the purse a little more the deeper it is (camps pay nothing).
    if (o.kind !== 'camp') addCoins(s, 5 + Math.min(60, 2 * r.id), r.cx * CW + 7, r.cy * CH + 7);
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
    if (s.expedition) s.expedition.best = Math.max(s.expedition.best, rid);
    const info = regionInfo(s.config.seed, rid);
    // After falling back to a camp the same regions come again: the journey lists them once.
    if (!adv.journey.some((j) => j.id === rid)) adv.journey.push({ id: rid, name: info.name, biome: info.biome, variant: info.variant, arc: info.arc });
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
  if (reg.objective.kind === 'boss' && !reg.cleared && !s.boss) wakeGuardian(s, reg);
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

// ───────────────────────────── seals, roots, brambles, grass ─────────────────────────────

const BRAMBLE_REGROW = 600; // ticks
const GRASS_SPREAD = 21; // ticks between a burning tuft and its neighbours
const GRASS_BURN = 50; // ticks a tuft burns

/** Fresh blast flames (this tick, from real bombs) touching a pillar-like prop from any side. */
const blastIdsAround = (s: GameState, x: number, y: number) => {
  const ids = new Set<number>();
  for (const d of DIRS) for (const f of flamesAt(s, x + DIR_VEC[d].x, y + DIR_VEC[d].y)) if (f.bornTick === s.tick && f.bombId >= 0) ids.add(f.bombId);
  return ids;
};

function updateObsidianAndForest(s: GameState) {
  const adv = s.adventure!;
  for (const pr of adv.props) {
    if (pr.kind === 'seal' && pr.state === 'intact') {
      const ids = blastIdsAround(s, pr.x, pr.y);
      if (!ids.size) continue;
      // Obsidian only gives way to a chain: two or more bombs going off together.
      if (ids.size < 2) {
        s.events.push({ type: 'sealResisted', propId: pr.id, x: pr.x, y: pr.y });
        continue;
      }
      pr.hp = (pr.hp ?? 3) - 1;
      pr.tick = s.tick;
      if (pr.hp > 0) {
        s.events.push({ type: 'sealCracked', propId: pr.id, x: pr.x, y: pr.y, hp: pr.hp });
        continue;
      }
      pr.state = 'broken';
      setCell(s.grid, pr.x, pr.y, Cell.Floor);
      const left = adv.props.filter((q) => q.kind === 'seal' && q.region === pr.region && q.state === 'intact').length;
      s.events.push({ type: 'sealBroken', propId: pr.id, x: pr.x, y: pr.y, left });
    } else if (pr.kind === 'root' && pr.state === 'intact') {
      if (!blastIdsAround(s, pr.x, pr.y).size) continue;
      pr.hp = (pr.hp ?? 3) - 1;
      pr.tick = s.tick;
      if (pr.hp > 0) {
        s.events.push({ type: 'rootHit', propId: pr.id, x: pr.x, y: pr.y, hp: pr.hp });
        continue;
      }
      pr.state = 'broken';
      setCell(s.grid, pr.x, pr.y, Cell.Floor);
      const left = adv.props.filter((q) => q.kind === 'root' && q.region === pr.region && q.state === 'intact').length;
      const chamber = adv.regions.find((r) => r.id === pr.region)?.objective.kind === 'boss';
      s.events.push({ type: 'rootPurified', propId: pr.id, x: pr.x, y: pr.y, left, ...(chamber ? { chamber } : {}) });
    } else if (pr.kind === 'bramble') {
      const cell = getCell(s.grid, pr.x, pr.y);
      if (pr.state === 'grown') {
        if (cell === Cell.Block) continue;
        pr.state = 'cut';
        pr.tick = s.tick;
        continue;
      }
      // Brambles grow back while a corrupted root of the region still lives.
      if (s.tick - pr.tick < BRAMBLE_REGROW || cell !== Cell.Floor) continue;
      if (!adv.props.some((q) => q.kind === 'root' && q.region === pr.region && q.state === 'intact')) continue;
      const busy =
        s.players.some((p) => p.alive && Math.abs(p.x - pr.x) + Math.abs(p.y - pr.y) < 1.6) ||
        s.enemies.some((e) => e.alive && Math.abs(e.x - pr.x) + Math.abs(e.y - pr.y) < 1) ||
        !!bombAt(s, pr.x, pr.y) ||
        !!powerupAt(s, pr.x, pr.y) ||
        !!mineAt(s, pr.x, pr.y) ||
        flamesAt(s, pr.x, pr.y).length > 0;
      if (busy) continue;
      setCell(s.grid, pr.x, pr.y, Cell.Block);
      pr.state = 'grown';
      pr.tick = s.tick;
      s.events.push({ type: 'brambleRegrow', propId: pr.id, x: pr.x, y: pr.y });
    } else if (pr.kind === 'grass') {
      if (pr.state === 'dry') {
        if (!flamesAt(s, pr.x, pr.y).length) continue;
        igniteGrass(s, pr);
      } else if (pr.state === 'burning') {
        const age = s.tick - pr.tick;
        if (age === GRASS_SPREAD)
          for (const q of adv.props)
            if (q.kind === 'grass' && q.state === 'dry' && Math.abs(q.x - pr.x) + Math.abs(q.y - pr.y) === 1) igniteGrass(s, q);
        if (age >= GRASS_BURN) pr.state = 'burnt';
      }
    }
  }
}

function igniteGrass(s: GameState, g: PropState) {
  g.state = 'burning';
  g.tick = s.tick;
  // The burning tuft is a flame of its own: deadly, and it sets bombs off.
  s.flames.push({ x: g.x, y: g.y, part: 'center', dir: null, bombId: -2, ownerId: '', bornTick: s.tick, untilTick: s.tick + GRASS_BURN, kind: 'normal' });
  s.events.push({ type: 'grassIgnited', propId: g.id, x: g.x, y: g.y });
}

/** Whatever stands on lava (not jumping over it) is lost: players, Magmitos, bombs, power-ups. */
function updateLavaFalls(s: GameState) {
  const lava = (x: number, y: number) => isPit(getCell(s.grid, Math.round(x), Math.round(y)));
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
      // The Mimic's double chest only opens by hand (the blast that beat it lands right on it).
      const burned = pr.hp !== 2 && flamesAt(s, pr.x, pr.y).length > 0;
      if (!opener && !burned) continue;
      // B4: the Mimic (only the first time: beaten, it leaves the real, double chest).
      if (pr.mimic && pr.hp === undefined) {
        pr.state = 'used';
        pr.tick = s.tick;
        wakeMimic(s, pr, opener ?? null, regionDifficulty(s.config.seed, pr.region).enemySpeed);
      } else openChest(s, pr, opener?.id ?? null);
    } else if (pr.kind === 'key') updateKey(s, pr);
    else if (pr.kind === 'totem' && pr.state === 'idle') updateTotem(s, pr);
    else if (pr.kind === 'campfire' && pr.state === 'unlit') updateCampfire(s, pr);
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

/**
 * Totem of Return: while an ally is down, a player's blast against the totem brings them back
 * beside it (with spawn protection). One use per boss phase: the next phase recharges it.
 */
function updateTotem(s: GameState, pr: PropState) {
  const fallen = s.players.find((p) => !p.alive && !p.left);
  if (!fallen) return;
  let byId: string | null = null;
  for (const d of DIRS)
    for (const f of flamesAt(s, pr.x + DIR_VEC[d].x, pr.y + DIR_VEC[d].y))
      if (f.bornTick === s.tick && f.bombId >= 0 && s.players.some((p) => p.id === f.ownerId)) byId = f.ownerId;
  if (!byId) return;
  const c = safeCellsNear(s, pr.x, pr.y, 1)[0] ?? { x: pr.x, y: pr.y + 1 };
  Object.assign(fallen, {
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
  pr.state = 'used';
  pr.tick = s.tick;
  s.events.push({ type: 'totemRevive', propId: pr.id, playerId: fallen.id, byId, x: c.x, y: c.y });
}

function openChest(s: GameState, pr: PropState, byId: string | null) {
  pr.state = 'open';
  pr.tick = s.tick;
  s.events.push({ type: 'chestOpened', propId: pr.id, x: pr.x, y: pr.y, rare: !!pr.rare, byId });
  addCoins(s, (pr.hp === 2 ? 30 : pr.rare ? 15 : 5) + Math.floor(pr.region / 2), pr.x, pr.y);
  contractStep(s, 'chests', pr.region);
  const loot: PowerupType[] = [pickWeighted(s, Object.values(POWERUPS), (d) => d.weight).type];
  if (pr.rare) loot.push(RARE_LOOT[randInt(s, RARE_LOOT.length)]);
  // The Mimic's double chest: twice the loot, and always a rare piece.
  if (pr.hp === 2) loot.push(pickWeighted(s, Object.values(POWERUPS), (d) => d.weight).type, RARE_LOOT[randInt(s, RARE_LOOT.length)], ...(pr.rare ? [RARE_LOOT[randInt(s, RARE_LOOT.length)]] : []));
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
  addResident(s, hero);
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
  // A3: the scout already walked the arc ahead: its regions show whole on the map.
  const scoutTo = s.expedition?.scoutTo ?? -1;
  if (scoutTo >= 0)
    for (let i = 0; i < adv.regionOf.length; i++) {
      const reg = adv.regionOf[i];
      if (reg >= 0 && reg < scoutTo && reg > (s.expedition?.camp ?? 0) - 1) adv.explored[i] = 1;
    }
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
