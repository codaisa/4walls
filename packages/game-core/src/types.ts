import type { AbilityId, BiomeId, BombKind, BossId, Dir, GameConfig, GameEventId, ModeId, PlayerInput, PowerupType } from '@4walls/shared';

export interface Grid {
  w: number;
  h: number;
  /** World coordinates of the grid's first cell (0 for arenas; the Adventure window slides). */
  x0: number;
  y0: number;
  cells: Uint8Array;
}

export interface PlayerState {
  id: string;
  slot: number;
  name: string;
  characterId: string;
  /** Cosmetic only — never read by gameplay rules. */
  colorIndex: number;
  /** Position in cell units; the cell center of (cx, cy) is exactly (cx, cy). */
  x: number;
  y: number;
  /** Position at the previous tick (for render interpolation). */
  px: number;
  py: number;
  facing: Dir;
  moving: boolean;
  alive: boolean;
  speed: number;
  maxBombs: number;
  range: number;
  speedLevel: number;
  shield: number;
  invulnUntil: number;
  /** Left the online match for good (never revived). */
  left?: boolean;
  /** Bombs this player is still overlapping and may walk off of. */
  passBombs: number[];
  diedTick: number;
  kills: number;
  blocksDestroyed: number;
  // ── Phase 5 ──
  /** Tick at which the character ability is ready again. */
  abilityReadyTick: number;
  /** Frozen by an ice blast: cannot move or act until this tick. */
  frozenUntil: number;
  /** Ghost power-up: walks through destructible blocks until this tick. */
  ghostUntil: number;
  canKick: boolean;
  hasBoots: boolean;
  hasRemote: boolean;
  special: { kind: Exclude<BombKind, 'normal'>; charges: number } | null;
  /** Ice floor event: direction the player keeps sliding in. */
  slideDir: Dir | null;
  // ── Moves ──
  /** Glove power-up: pressing bomb on your own bomb throws it over walls. */
  canThrow: boolean;
  /** Roll / jump in progress (position is scripted from → to while it lasts). */
  maneuver: Maneuver | null;
  maneuverReadyTick: number;
  /** Turbo ability (Ayrton Senha): double speed until this tick. */
  turboUntil: number;
}

export interface Maneuver {
  kind: 'roll' | 'jump';
  dir: Dir;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startTick: number;
  endTick: number;
}

export interface BombState {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  range: number;
  placedTick: number;
  detonateTick: number;
  kind: BombKind;
  /** Remote bombs wait for the owner's ability button (with a safety timeout). */
  remote: boolean;
  /** Ability mini-bomb: does not count toward the simultaneous bomb limit. */
  extra: boolean;
  /** Kicked bombs slide one cell every few ticks until blocked. */
  slideDir: Dir | null;
  nextSlideTick: number;
  /** Previous cell and the tick the bomb left it (for smooth rendering of slides). */
  fromX: number;
  fromY: number;
  movedTick: number;
  /** Thrown bomb: in the air (not blocking, not exploding) until this tick. 0 = never thrown. */
  flightUntil: number;
}

export interface Flame {
  x: number;
  y: number;
  bombId: number;
  ownerId: string;
  bornTick: number;
  untilTick: number;
  /** 'center' | arm piece | arm end — purely for rendering. */
  part: 'center' | 'arm' | 'end';
  dir: Dir | null;
  kind: BombKind;
  /** Rendering/flavour only: 'root' = Guardião's root spikes (still lethal like fire). */
  style?: 'root';
}

export interface PowerupState {
  id: number;
  type: PowerupType;
  x: number;
  y: number;
  bornTick: number;
}

export interface MineState {
  id: number;
  ownerId: string;
  x: number;
  y: number;
  armedTick: number;
  expireTick: number;
}

export interface MeteorState {
  id: number;
  x: number;
  y: number;
  spawnTick: number;
  impactTick: number;
}

export interface ArenaEventState {
  type: GameEventId;
  phase: 'warning' | 'active';
  warnTick: number;
  startTick: number;
  endTick: number;
}

export interface EnemyState {
  id: number;
  /** magmite = wandering lava blob; sprout = Guardião's summoned seedling. */
  kind: 'magmite' | 'sprout' | 'spark';
  /** Fagulha behavior: wander → alert (telegraph) → charge in a line → rest. */
  mode?: 'wander' | 'alert' | 'charge' | 'rest';
  modeUntil?: number;
  x: number;
  y: number;
  px: number;
  py: number;
  dir: Dir | null;
  tx: number;
  ty: number;
  alive: boolean;
  diedTick: number;
  frozenUntil: number;
  /** Adventure: region the enemy guards (-1 elsewhere). */
  regionId: number;
  /** Adventure depth makes Magmitos faster (1 = normal). */
  speedMul?: number;
}

export type RegionObjectiveKind = 'clear' | 'key' | 'lever';

/** What opens a region's exit gate. */
export interface RegionObjective {
  kind: RegionObjectiveKind;
  progress: number;
  goal: number;
  done: boolean;
}

/** Direction from one region to the next on the endless world lattice (never back west). */
export type RegionDir = 'E' | 'N' | 'S';

export interface RegionState {
  /** Depth index (0 = first region). Unique for the whole journey. */
  id: number;
  name: string;
  /** Chapter subtitle ("O despertar", "A chave perdida"...). */
  chapter: string;
  biome: BiomeId;
  /** Chunk position on the world lattice. */
  cx: number;
  cy: number;
  objective: RegionObjective;
  /** Players may be here (the previous gate opened). */
  unlocked: boolean;
  /** Objective done: the exit gate is open. */
  cleared: boolean;
  /** Corridor cell at the edge this region is entered from (null for the first region). */
  entry: { x: number; y: number } | null;
}

export interface GateState {
  id: number;
  x: number;
  y: number;
  /** 'h' = the passage runs along X (east/west gate), 'v' = along Y. */
  axis: 'h' | 'v';
  from: number;
  to: number;
  open: boolean;
  openedTick: number;
  /** 'exit' opens forward; 'back' is the gate sealed behind the group (never opens). */
  kind?: 'exit' | 'back';
}

export type PropKind = 'chest' | 'key' | 'brazier' | 'vent' | 'bridge' | 'platform' | 'geyser' | 'lever';

/**
 * Adventure props. Chest: opened by walking onto it or by a blast, drops loot (rare = secret).
 * Key: picked up by walking onto it, carried above the carrier's head, dropped where they fall,
 * delivered at the region's exit gate.
 */
export interface PropState {
  id: number;
  kind: PropKind;
  region: number;
  x: number;
  y: number;
  /** chest: closed | open | hidden (mission reward); key: idle | carried | used; brazier: unlit | lit; vent: idle */
  state: 'closed' | 'open' | 'idle' | 'carried' | 'used' | 'hidden' | 'unlit' | 'lit' | 'solid' | 'cracking' | 'fallen' | 'raised' | 'lowered' | 'off' | 'on';
  /** bridge: a fragile plank bridge or a drawbridge plank (lowered by the lever). */
  variant?: 'fragile' | 'draw';
  /** platform: the river cells it shuttles across, from the near bank to the far one. */
  track?: { x: number; y: number }[];
  rare?: boolean;
  carrierId?: string | null;
  /** Where a key returns if it is lost. */
  homeX?: number;
  homeY?: number;
  tick: number;
}

/** Endless, streamed world: a window of 1–3 live regions on an infinite lattice. */
export interface AdventureState {
  chunkW: number;
  chunkH: number;
  /** Deepest region a living player has entered. */
  depth: number;
  /** Live regions (the window), in id order. */
  regions: RegionState[];
  gates: GateState[];
  /** Region id of every grid cell (-1 = outside every region). */
  regionOf: Int16Array;
  /** 1 once any player has seen the cell. */
  explored: Uint8Array;
  /** Caged heroes waiting to be rescued (one per region). */
  cages: CageState[];
  props: PropState[];
  /** The gate behind the group closes at this tick unless everyone is already through. */
  closing: { region: number; atTick: number } | null;
  /** Every region entered so far (for the journey map and the results). */
  journey: { id: number; name: string; biome: BiomeId }[];
  /** Lattice chain: dirs[i] goes from region i to region i + 1 (grown on demand). */
  dirs: RegionDir[];
  /** Changes whenever regions attach or detach (renderers rebuild on it). */
  windowKey: string;
}

/**
 * A caged hero. Locked: the cell is a destructible block drawn as a cage. A blast frees the
 * prisoner (state "free"); touching them rescues them: a fallen ally comes back as a random hero,
 * or the rescuer turns into one.
 */
export interface CageState {
  id: number;
  x: number;
  y: number;
  region: number;
  state: 'locked' | 'free' | 'rescued';
}

export type BossAction = 'walk' | 'windup' | 'recover' | 'charge' | 'stunned' | 'burrowed' | 'dead';
export type BossAttack = 'slam' | 'meteors' | 'charge' | 'roots' | 'spores' | 'burrow';

/**
 * A boss: one big body centered on a cell that covers the 3×3 cells around it.
 * Its AI is a small state machine (walk → wind-up → attack → recover) driven by ticks.
 */
export interface BossState {
  kind: BossId;
  /** Body center, in cell units (integer while standing on a cell). */
  x: number;
  y: number;
  px: number;
  py: number;
  /** Cell it is walking to (center). */
  tx: number;
  ty: number;
  facing: Dir;
  hp: number;
  maxHp: number;
  enraged: boolean;
  action: BossAction;
  actionStart: number;
  actionUntil: number;
  /** Attack being wound up / performed. */
  attack: BossAttack | null;
  /** Charge direction (set during the charge wind-up). */
  chargeDir: Dir | null;
  /** Telegraphed cells of the attack being wound up (roots), or [emerge point] while burrowing. */
  targets: { x: number; y: number }[];
  nextAttackTick: number;
  invulnUntil: number;
  frozenUntil: number;
  lastHitTick: number;
  diedTick: number;
}

export type GameEvent =
  | { type: 'countdown'; value: number }
  | { type: 'go' }
  | { type: 'bombPlaced'; bombId: number; x: number; y: number; ownerId: string; kind: BombKind }
  | { type: 'explosion'; bombId: number; x: number; y: number; ownerId: string; kind: BombKind; cells: { x: number; y: number }[] }
  | { type: 'blockDestroyed'; x: number; y: number; byId: string }
  | { type: 'powerupSpawned'; id: number; x: number; y: number; powerup: PowerupType }
  | { type: 'powerupCollected'; id: number; playerId: string; powerup: PowerupType; x: number; y: number }
  | { type: 'powerupBurned'; id: number; x: number; y: number }
  | { type: 'shieldBroken'; playerId: string }
  | { type: 'playerDied'; playerId: string; byId: string | null; x: number; y: number }
  | { type: 'playerFrozen'; playerId: string; x: number; y: number }
  | { type: 'enemyDied'; enemyId: number; byId: string; x: number; y: number }
  | { type: 'abilityUsed'; playerId: string; ability: AbilityId; x: number; y: number; fromX: number; fromY: number }
  | { type: 'bombKicked'; bombId: number; playerId: string }
  | { type: 'bombThrown'; bombId: number; playerId: string; fromX: number; fromY: number; x: number; y: number }
  | { type: 'playerRolled'; playerId: string; dir: Dir }
  | { type: 'playerJumped'; playerId: string; dir: Dir }
  | { type: 'playerLanded'; playerId: string; x: number; y: number }
  | { type: 'mineTriggered'; mineId: number; x: number; y: number }
  | { type: 'eventWarning'; event: GameEventId }
  | { type: 'eventStart'; event: GameEventId }
  | { type: 'eventEnd'; event: GameEventId }
  | { type: 'meteorImpact'; x: number; y: number }
  | { type: 'regionCleared'; region: number }
  | { type: 'gateOpened'; gateId: number; x: number; y: number; region: number }
  /** Adventure: a fallen ally comes back when a gate opens. */
  | { type: 'playerRevived'; playerId: string; x: number; y: number }
  | { type: 'cageOpened'; cageId: number; x: number; y: number }
  /** Endless Adventure streaming: a region joined / left the live window (clients rebuild the same world). */
  | { type: 'regionAttached'; region: number }
  | { type: 'regionDetached'; region: number }
  | { type: 'regionEntered'; region: number }
  | { type: 'gateClosing'; region: number; atTick: number }
  | { type: 'gateClosed'; region: number }
  | { type: 'objectiveProgress'; region: number; progress: number; goal: number }
  | { type: 'chestOpened'; propId: number; x: number; y: number; rare: boolean; byId: string | null }
  | { type: 'keyPicked'; propId: number; playerId: string }
  | { type: 'keyDropped'; propId: number; x: number; y: number }
  | { type: 'keyDelivered'; propId: number; playerId: string; region: number }
  | { type: 'secretFound'; x: number; y: number; byId: string }
  | { type: 'sparkAlert'; enemyId: number; x: number; y: number }
  | { type: 'brazierLit'; propId: number; x: number; y: number; region: number; lit: number; goal: number }
  | { type: 'missionDone'; region: number; x: number; y: number }
  | { type: 'bridgeCracking'; propId: number; x: number; y: number }
  | { type: 'bridgeFell'; propId: number; x: number; y: number }
  | { type: 'bridgeRestored'; propId: number; x: number; y: number }
  | { type: 'playerFell'; playerId: string; x: number; y: number }
  | { type: 'sankInLava'; x: number; y: number }
  | { type: 'geyserWarn'; propId: number; x: number; y: number }
  | { type: 'geyserErupt'; propId: number; x: number; y: number }
  | { type: 'leverPulled'; propId: number; x: number; y: number; region: number }
  /** A rescued hero joins: `revived` = a fallen ally came back as them, otherwise the rescuer turned into them. */
  | { type: 'heroJoined'; playerId: string; byId: string; characterId: string; previousId: string; revived: boolean; x: number; y: number }
  | { type: 'bossSpawned'; boss: BossId; index: number; total: number }
  | { type: 'bossWindup'; attack: BossAttack }
  | { type: 'bossSlam'; x: number; y: number }
  | { type: 'bossRoar'; x: number; y: number }
  | { type: 'bossCharge'; dir: Dir }
  | { type: 'bossHit'; hp: number; maxHp: number; byId: string; x: number; y: number }
  | { type: 'bossEnraged' }
  | { type: 'bossRoots'; cells: { x: number; y: number }[] }
  | { type: 'bossSpores'; x: number; y: number }
  | { type: 'bossBurrow'; x: number; y: number }
  | { type: 'bossEmerge'; x: number; y: number }
  | { type: 'bossDefeated'; boss: BossId; x: number; y: number }
  | { type: 'gameOver'; result: GameResult };

export interface GameResult {
  outcome: 'victory' | 'defeat' | 'winner' | 'draw';
  winnerIds: string[];
  reason: 'lastStanding' | 'allEnemiesDown' | 'allPlayersDown' | 'timeUp' | 'allRegionsCleared' | 'bossesDefeated';
}

export type Phase = 'countdown' | 'playing' | 'ended';

export interface GameState {
  config: GameConfig;
  mode: ModeId;
  tick: number;
  phase: Phase;
  phaseStartTick: number;
  countdownTicks: number;
  timeLeftTicks: number;
  grid: Grid;
  players: PlayerState[];
  bombs: BombState[];
  flames: Flame[];
  powerups: PowerupState[];
  enemies: EnemyState[];
  mines: MineState[];
  meteors: MeteorState[];
  event: ArenaEventState | null;
  /** Present only in adventure mode. */
  adventure: AdventureState | null;
  /** Boss Rush: the boss currently in the arena (null between bosses). */
  boss: BossState | null;
  /** Boss Rush: bosses still to come, and how many were defeated. */
  bossQueue: BossId[];
  bossesDefeated: number;
  /** Tick at which the next boss enters (-1 = none pending). */
  nextBossTick: number;
  /** Tick at which the next random event is announced (-1 = events disabled). */
  nextEventTick: number;
  rng: number;
  nextId: number;
  result: GameResult | null;
  /** Events produced during the last step; cleared at the start of every step. */
  events: GameEvent[];
}

export type InputMap = Record<string, PlayerInput | undefined>;
