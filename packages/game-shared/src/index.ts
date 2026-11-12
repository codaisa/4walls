// @4walls/shared — types, constants and tunables shared by core, client and (future) server.

export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

/** Converts seconds to simulation ticks. */
export const secToTicks = (s: number) => Math.round(s * TICK_RATE);

export enum Cell {
  Floor = 0,
  Wall = 1,
  Block = 2,
  /** Cracked wall (Adventure secrets): solid like a wall, a blast turns it into floor. */
  Cracked = 3,
  /** Lava river (Adventure): nobody walks on it, blasts fly over it, falling in is fatal. */
  Lava = 4,
  /** Bottomless chasm (Adventure): same rules as lava, a long fall instead of a burn. */
  Chasm = 5,
}

export type Dir = 'up' | 'down' | 'left' | 'right';
export const DIRS: readonly Dir[] = ['up', 'down', 'left', 'right'];
export const DIR_VEC: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
export const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/** Per-player intent for one simulation tick. Edges (bomb/ability) are true only on the tick they are consumed. */
export interface PlayerInput {
  move: Dir | null;
  bomb: boolean;
  ability: boolean;
  /** Dodge roll (edge-triggered like bomb/ability). */
  roll?: boolean;
  /** Jump: hops over a bomb (or a gap) and dodges ground fire while airborne. */
  jump?: boolean;
  /** Adventure: end the expedition at a lit campfire (keeps everything carried). */
  campEnd?: boolean;
  /** Adventure: put the carried coins in the campfire's vault (safe from falls). */
  campBank?: boolean;
}
export const EMPTY_INPUT: PlayerInput = { move: null, bomb: false, ability: false };

export type PowerupType = 'bombUp' | 'fireUp' | 'speedUp' | 'shield' | 'kick' | 'boots' | 'ghost' | 'remote' | 'infernal' | 'ice' | 'glove';
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface PowerupDef {
  type: PowerupType;
  name: string;
  description: string;
  rarity: Rarity;
  /** Relative drop weight. */
  weight: number;
}

export const POWERUPS: Record<PowerupType, PowerupDef> = {
  bombUp: { type: 'bombUp', name: 'Bomb Up', description: '+1 bomba simultânea', rarity: 'common', weight: 30 },
  fireUp: { type: 'fireUp', name: 'Fire Up', description: '+1 alcance de explosão', rarity: 'common', weight: 30 },
  speedUp: { type: 'speedUp', name: 'Speed Up', description: '+velocidade', rarity: 'uncommon', weight: 15 },
  kick: { type: 'kick', name: 'Chute', description: 'Andar contra uma bomba a chuta', rarity: 'uncommon', weight: 10 },
  boots: { type: 'boots', name: 'Botas', description: 'Atravessa bombas', rarity: 'uncommon', weight: 8 },
  shield: { type: 'shield', name: 'Escudo', description: 'Absorve um ataque', rarity: 'rare', weight: 8 },
  ghost: { type: 'ghost', name: 'Fantasma', description: 'Atravessa blocos por 8 s', rarity: 'rare', weight: 6 },
  remote: { type: 'remote', name: 'Controle Remoto', description: 'Bombas só explodem com Habilidade', rarity: 'rare', weight: 5 },
  glove: { type: 'glove', name: 'Luva', description: 'Bomba de novo em cima dela: arremessa por cima das paredes', rarity: 'rare', weight: 7 },
  infernal: { type: 'infernal', name: 'Bomba Infernal', description: '3 bombas que deixam fogo no chão', rarity: 'epic', weight: 6 },
  ice: { type: 'ice', name: 'Bomba de Gelo', description: '3 bombas que congelam em vez de matar', rarity: 'epic', weight: 6 },
};

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#e8e2d6',
  uncommon: '#6fe36f',
  rare: '#4fa8ff',
  epic: '#c46bff',
  legendary: '#ffb02e',
};

/** Bomb flavours. New kinds plug into the core's BOMB_KINDS registry. */
export type BombKind = 'normal' | 'fire' | 'ice';

export const RULES = {
  baseSpeed: 3.6, // cells / second
  speedStep: 0.45,
  maxSpeed: 6.6,
  baseBombs: 1,
  maxBombs: 8,
  baseRange: 2,
  maxRange: 9,
  fuseSec: 2.6,
  flameSec: 0.6,
  invulnSec: 1.4,
  countdownSec: 3,
  roundSec: 180,
  blockFill: 0.7,
  powerupChance: 0.38,
  enemySpeed: 1.9,
  // Fagulha (Adventure): quick spark that charges in a straight line after a short warning.
  sparkSpeed: 2.5,
  sparkSight: 5,
  sparkAlertSec: 0.45,
  sparkChargeSpeed: 6.5,
  sparkRestSec: 1.1,
  enemyContactDist: 0.62,
  // Phase 5 content
  kickSpeed: 9, // cells / second for a kicked bomb
  ghostSec: 8,
  specialCharges: 3,
  fireFlameSec: 2.8,
  freezeSec: 2,
  enemyFreezeSec: 3.5,
  remoteMaxSec: 15,
  mineArmSec: 1,
  mineLifeSec: 25,
  maxMines: 2,
  dashCells: 3,
  // Rescued characters' abilities
  forroRadius: 2,
  forroStunSec: 1,
  laughRadius: 3,
  laughSec: 1.5,
  blunderbussCells: 3,
  turboSec: 2.5,
  turboMult: 2,
  eventFirstSec: 30,
  eventIntervalSec: 45,
  eventWarnSec: 3,
  eventDurationSec: 18,
  meteorEverySec: 0.45,
  // Moves
  rollCells: 2,
  rollSec: 0.42,
  rollInvulnSec: 0.22,
  rollCooldownSec: 0.9,
  jumpSec: 0.5,
  jumpCooldownSec: 0.55,
  throwCells: 3,
  throwMaxCells: 6,
  throwFlightSec: 0.5,
  meteorFallSec: 1.6,
} as const;

export type ModeId = 'solo' | 'versus' | 'adventure' | 'bossrush';

export type BossId = 'golem' | 'guardian';

/** Boss tuning. Times in seconds, speeds in cells/second. */
export interface BossDef {
  id: BossId;
  name: string;
  title: string;
  hp: number;
  speed: number;
  /** Speed once enraged (below half HP). */
  enragedSpeed: number;
  /** Pause between attacks (normal / enraged). */
  attackEverySec: number;
  enragedAttackEverySec: number;
  /** Hit cooldown so one blast counts once. */
  hitCooldownSec: number;
  slamWindupSec: number;
  meteorWindupSec: number;
  chargeWindupSec: number;
  chargeSpeed: number;
  recoverSec: number;
  /** Meteors called per "lava rain" (normal / enraged). */
  meteors: number;
  enragedMeteors: number;
  freezeSec: number;
  /** Which attacks this boss uses. */
  attacks: ('slam' | 'meteors' | 'charge' | 'roots' | 'spores' | 'burrow' | 'leap')[];
  /** Health fractions where a new phase starts (phase 1 is the enraged one). */
  phases: number[];
  /** Extra phases for stronger (deeper) encounters in the Adventure. */
  deepPhases?: number[];
  /** Phases of the reworked Adventure version (every encounter, from the first). */
  adventurePhases?: number[];
  /** Armored boss: blasts only hurt it during these actions (otherwise they clank off). */
  exposedDuring?: ('walk' | 'windup' | 'recover' | 'charge' | 'stunned')[];
  /** Guardião: root lines, sprout summons and the underground dive. */
  rootsWindupSec?: number;
  sporesWindupSec?: number;
  burrowWindupSec?: number;
  burrowSec?: number;
  sprouts?: number;
  enragedSprouts?: number;
  maxSprouts?: number;
}

export const BOSSES: Record<BossId, BossDef> = {
  golem: {
    id: 'golem',
    name: 'Golem Vulcânico',
    title: 'O coração de magma da Caldeira',
    hp: 14,
    speed: 1.15,
    enragedSpeed: 1.6,
    attackEverySec: 3.2,
    enragedAttackEverySec: 2.1,
    hitCooldownSec: 0.7,
    slamWindupSec: 1.0,
    meteorWindupSec: 0.8,
    chargeWindupSec: 0.75,
    chargeSpeed: 6.5,
    recoverSec: 1.1,
    meteors: 4,
    enragedMeteors: 7,
    freezeSec: 1.6,
    attacks: ['slam', 'meteors', 'charge'],
    phases: [0.5],
    deepPhases: [0.5, 0.25],
    // Adventure Golem: armor → lava rising from the edges → the floor-cracking leap.
    adventurePhases: [0.66, 0.33],
  },
  guardian: {
    id: 'guardian',
    name: 'Guardião Ancião',
    title: 'A árvore mais velha da Floresta Encantada',
    hp: 16,
    speed: 0.9,
    enragedSpeed: 1.25,
    attackEverySec: 2.8,
    enragedAttackEverySec: 1.9,
    hitCooldownSec: 0.7,
    slamWindupSec: 1.0,
    meteorWindupSec: 0.8,
    chargeWindupSec: 0.75,
    chargeSpeed: 6,
    recoverSec: 1.3,
    meteors: 0,
    enragedMeteors: 0,
    freezeSec: 1.4,
    attacks: ['roots', 'spores', 'burrow'],
    phases: [0.5],
    deepPhases: [0.5, 0.25],
    rootsWindupSec: 1.0,
    sporesWindupSec: 0.7,
    burrowWindupSec: 0.6,
    burrowSec: 1.2,
    // Adventure Guardian: rooted until its 3 support roots fall, then mobile; last breath at 35%.
    adventurePhases: [0.35],
    sprouts: 3,
    enragedSprouts: 5,
    maxSprouts: 6,
  },
};

/** Boss Rush: bosses in order (more join as they are designed). */
export const BOSS_RUSH: BossId[] = ['golem', 'guardian'];
export const BOSS_ARENA = { width: 17, height: 15, blockFill: 0.14, roundSec: 300 } as const;

/** Adventure mode: a continuous world of irregular regions behind sealed gates, under fog of war. */
export const ADVENTURE = {
  regions: 5,
  chunkW: 16,
  chunkH: 14,
  revealRadius: 4.6,
  blockFill: 0.42,
  enemiesBase: 2,
  enemiesMax: 5,
  /** Deep regions never have more Magmitos than this (difficulty then comes from speed/density). */
  enemiesCap: 12,
} as const;

export type BiomeId = 'volcanic' | 'transition' | 'forest';

export type AbilityId = 'miniBomb' | 'dash' | 'mine' | 'forro' | 'laugh' | 'blunderbuss' | 'bicycle' | 'turbo' | 'prize';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  tagline: string;
  speedBonus: number;
  bombBonus: number;
  rangeBonus: number;
  /** Upper bound for Bomb Up on this character. */
  maxBombs: number;
  ability: AbilityId;
  abilityName: string;
  abilityDesc: string;
  cooldownSec: number;
  /** Everyone has it from the start; the others are rescued from cages in Adventure. */
  starter: boolean;
  /** Starts with the kick power. */
  startsWithKick?: boolean;
  /** Shown big on the "joins the fight" screen. */
  quote: string;
  /** Signature colors for the reveal screen and the locked card. */
  theme: { main: string; accent: string };
}

export type CharacterId = 'bombito' | 'ninja' | 'engenheiro' | 'bombzaga' | 'tiringao' | 'bombiao' | 'reipelota' | 'senha' | 'silvio';

/** Balanced by trade-offs: every perk costs something. Cosmetics never change these numbers. */
export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  bombito: {
    id: 'bombito',
    name: 'Bombito',
    tagline: 'Equilibrado. Ideal para iniciantes.',
    speedBonus: 0,
    bombBonus: 0,
    rangeBonus: 0,
    maxBombs: 8,
    ability: 'miniBomb',
    abilityName: 'Bomba Extra',
    abilityDesc: 'Solta uma mini-bomba mesmo no limite',
    cooldownSec: 9,
    starter: true,
    quote: 'Pavio curto, coração grande!',
    theme: { main: '#ffd21a', accent: '#ff7a3c' },
  },
  ninja: {
    id: 'ninja',
    name: 'Ninja',
    tagline: 'Rápido e escorregadio. Menos bombas.',
    speedBonus: 0.55,
    bombBonus: 0,
    rangeBonus: 0,
    maxBombs: 5,
    ability: 'dash',
    abilityName: 'Investida',
    abilityDesc: 'Avança 3 casas num instante',
    cooldownSec: 5,
    starter: true,
    quote: 'Você nem me viu passar.',
    theme: { main: '#3a3150', accent: '#ff4d6d' },
  },
  engenheiro: {
    id: 'engenheiro',
    name: 'Engenheiro',
    tagline: 'Armadilhas e controle de área. Mais lento.',
    speedBonus: -0.25,
    bombBonus: 0,
    rangeBonus: 0,
    maxBombs: 7,
    ability: 'mine',
    abilityName: 'Mina',
    abilityDesc: 'Planta uma mina que explode ao ser pisada (máx. 2)',
    cooldownSec: 8,
    starter: true,
    quote: 'Pisou? Já era.',
    theme: { main: '#ffc21a', accent: '#5a4632' },
  },
  // ── Rescued in Adventure: Brazilian legends, lightly renamed (affectionate parodies). ──
  bombzaga: {
    id: 'bombzaga',
    name: 'Luiz Bombzaga',
    tagline: 'O Rei do Baião-bum. Empurra o perigo para longe.',
    speedBonus: 0,
    bombBonus: 0,
    rangeBonus: 0,
    maxBombs: 6,
    ability: 'forro',
    abilityName: 'Forró Sísmico',
    abilityDesc: 'Um fole de sanfona empurra as bombas a até 2 casas e atordoa os Magmitos perto',
    cooldownSec: 8,
    starter: false,
    quote: 'Arrasta o pé que lá vem bomba!',
    theme: { main: '#8a5a33', accent: '#ffcc4d' },
  },
  tiringao: {
    id: 'tiringao',
    name: 'Tiringão',
    tagline: 'Piada pronta e explosão garantida. Um pouco lento.',
    speedBonus: -0.15,
    bombBonus: 0,
    rangeBonus: 0,
    maxBombs: 7,
    ability: 'laugh',
    abilityName: 'Gargalhada',
    abilityDesc: 'Quem estiver a até 3 casas (Magmitos e rivais) congela de tanto rir',
    cooldownSec: 10,
    starter: false,
    quote: 'Rapaz... deu ruim pra tu!',
    theme: { main: '#e8c26a', accent: '#d9481f' },
  },
  bombiao: {
    id: 'bombiao',
    name: 'Bombião',
    tagline: 'Cangaceiro de pontaria certeira. Lento, alcance maior.',
    speedBonus: -0.2,
    bombBonus: 0,
    rangeBonus: 1,
    maxBombs: 7,
    ability: 'blunderbuss',
    abilityName: 'Bacamarte',
    abilityDesc: 'Dispara uma explosão até 3 casas à frente (estoura bombas no caminho)',
    cooldownSec: 7,
    starter: false,
    quote: 'O sertão vai virar fumaça!',
    theme: { main: '#7a4a24', accent: '#f2b622' },
  },
  reipelota: {
    id: 'reipelota',
    name: 'Rei Pelota',
    tagline: 'Camisa 10 das explosões. Já sai chutando bombas.',
    speedBonus: 0.3,
    bombBonus: 0,
    rangeBonus: 0,
    maxBombs: 6,
    ability: 'bicycle',
    abilityName: 'Bicicleta',
    abilityDesc: 'Põe uma bomba e já chuta ela deslizando para a frente',
    cooldownSec: 6,
    starter: false,
    startsWithKick: true,
    quote: 'Bomba no ângulo!',
    theme: { main: '#ffdf00', accent: '#009c3b' },
  },
  senha: {
    id: 'senha',
    name: 'Ayrton Senha',
    tagline: 'Rápido como um domingo de manhã. Poucas bombas.',
    speedBonus: 0.4,
    bombBonus: 0,
    rangeBonus: 0,
    maxBombs: 5,
    ability: 'turbo',
    abilityName: 'Turbo',
    abilityDesc: 'Dobra a velocidade por 2,5 segundos',
    cooldownSec: 10,
    starter: false,
    quote: 'Primeira curva, primeira explosão!',
    theme: { main: '#ffd400', accent: '#0a7a3c' },
  },
  silvio: {
    id: 'silvio',
    name: 'Silvio Bombos',
    tagline: 'O apresentador mais explosivo da TV. Um pouco lento.',
    speedBonus: -0.1,
    bombBonus: 0,
    rangeBonus: 0,
    maxBombs: 6,
    ability: 'prize',
    abilityName: 'Quem quer bomba?',
    abilityDesc: 'Faz aparecer um power-up aleatório ao lado dele',
    cooldownSec: 14,
    starter: false,
    quote: 'Quem quer bomba? Ma oeee!',
    theme: { main: '#1f5fd1', accent: '#ffd23f' },
  },
};
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];
export const STARTER_CHARACTERS = CHARACTER_IDS.filter((id) => CHARACTERS[id].starter);

export type ArenaId = 'caldeira' | 'floresta';
export interface ArenaDef {
  id: ArenaId;
  name: string;
  subtitle: string;
  width: number;
  height: number;
}
export const ARENAS: Record<ArenaId, ArenaDef> = {
  caldeira: { id: 'caldeira', name: 'Caldeira', subtitle: 'Vulcão · 15×13', width: 15, height: 13 },
  floresta: { id: 'floresta', name: 'Floresta Encantada', subtitle: 'Bosque mágico · 17×13', width: 17, height: 13 },
};
export const ARENA_IDS = Object.keys(ARENAS) as ArenaId[];

export type GameEventId = 'meteors' | 'iceFloor';
export const GAME_EVENTS: Record<GameEventId, { name: string; description: string }> = {
  meteors: { name: 'Chuva de Meteoros', description: 'Meteoros caem nas casas marcadas!' },
  iceFloor: { name: 'Piso Congelado', description: 'Sem atrito: você desliza até bater.' },
};

/** Visual palette per player slot (cosmetic only — never affects gameplay). */
export const SLOT_COLORS = [
  { primary: '#ffc21a', secondary: '#fff0a8', name: 'Solar' },
  { primary: '#2fb8ff', secondary: '#c7f0ff', name: 'Celeste' },
  { primary: '#7ddc3a', secondary: '#f4ffb0', name: 'Lima' },
  { primary: '#c46bff', secondary: '#ffd6ff', name: 'Ametista' },
] as const;

import type { Loadout } from './progression';
export * from './progression';

export interface PlayerSlotConfig {
  id: string;
  /** Gameplay slot: decides the spawn corner. */
  slot: number;
  characterId: string;
  name: string;
  /** Cosmetic color (index into SLOT_COLORS); defaults to the slot. */
  colorIndex?: number;
  /** Cosmetics (hat, bomb skin, explosion color, title). Never read by gameplay rules. */
  loadout?: Loadout;
}

/** A hero as it was at the last campfire (restored when the group falls back to it). */
export interface PlayerSnap {
  slot: number;
  characterId: string;
  speed: number;
  maxBombs: number;
  range: number;
  speedLevel: number;
  shield: number;
  canKick: boolean;
  hasBoots: boolean;
  hasRemote: boolean;
  canThrow: boolean;
  special: { kind: 'fire' | 'ice'; charges: number } | null;
}

/** Task 3: an Adventure expedition's progress (what a campfire saves). */
export interface ExpeditionSave {
  /** Region of the last campfire lit (0 = the start). */
  camp: number;
  /** Team purse carried (half is lost when the whole group falls). */
  coins: number;
  snapshot: PlayerSnap[];
  /** Times the group fell back to a camp, camps lit, furthest region reached. */
  returns: number;
  camps: number;
  best: number;
  /** Coins put in the vault at a campfire (never lost; online they went to the accounts). */
  banked?: number;
}

/** An expedition saved on an account (online: the host's) or on this device. */
export interface SavedExpedition {
  seed: number;
  save: ExpeditionSave;
  players: number;
  at: number;
}

/** One finished (or abandoned) expedition, for the account's history. */
export interface ExpeditionRecord {
  at: number;
  /** Furthest region reached (0-based), camps lit, falls back to camp. */
  best: number;
  camps: number;
  returns: number;
  /** Coins kept: banked plus carried when ended at a fire. */
  coins: number;
  ended: boolean;
}

export interface GameConfig {
  mode: ModeId;
  seed: number;
  width: number;
  height: number;
  players: PlayerSlotConfig[];
  enemyCount?: number;
  arenaId?: ArenaId;
  /** Random events on/off (default on). */
  events?: boolean;
  /** Adventure mode: number of regions to generate (default ADVENTURE.regions). */
  regions?: number;
  /** Boss Rush: bosses to fight in order (default BOSS_RUSH). */
  bosses?: BossId[];
  /** Boss Rush with the classic (pre-B5) Golem and Guardian (tests and regressions). */
  classicBosses?: boolean;
  /** Adventure: resume an expedition from its last campfire. */
  expedition?: ExpeditionSave;
}
