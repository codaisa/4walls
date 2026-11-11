// @4walls/shared — types, constants and tunables shared by core, client and (future) server.

export const TICK_RATE = 60;
export const TICK_DT = 1 / TICK_RATE;

/** Converts seconds to simulation ticks. */
export const secToTicks = (s: number) => Math.round(s * TICK_RATE);

export enum Cell {
  Floor = 0,
  Wall = 1,
  Block = 2,
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
  attacks: ('slam' | 'meteors' | 'charge' | 'roots' | 'spores' | 'burrow')[];
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
    rootsWindupSec: 1.0,
    sporesWindupSec: 0.7,
    burrowWindupSec: 0.6,
    burrowSec: 1.2,
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
} as const;

export type BiomeId = 'volcanic' | 'transition' | 'forest';

export type AbilityId = 'miniBomb' | 'dash' | 'mine';

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
}

export type CharacterId = 'bombito' | 'ninja' | 'engenheiro';

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
  },
};
export const CHARACTER_IDS = Object.keys(CHARACTERS) as CharacterId[];

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
}
