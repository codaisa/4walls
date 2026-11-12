// @4walls/protocol — wire contracts shared by the Colyseus server and the browser client.
//
// Key rule: a connection is NOT a player. One connection may own several player slots
// (couch co-op online); every input names the slot it drives and the server checks ownership.
import { ARENA_IDS, CHARACTER_IDS, DIRS, type ArenaId, type BossId, type CharacterId, type Dir, type GameConfig, type Loadout, type ModeId, type PlayerInput } from '@4walls/shared';
import type {
  ArenaEventState,
  BombState,
  BossState,
  EnemyState,
  Flame,
  GameEvent,
  GameResult,
  GameState,
  MeteorState,
  MineState,
  Phase,
  PlayerState,
  PowerupState,
} from '@4walls/core';

export const ROOM_NAME = 'arena';
export const DEFAULT_PORT = 2567;
export const MAX_ROOM_SLOTS = 4;
/** Server simulation and snapshot rates. */
export const SERVER_TICK_HZ = 60;
export const SNAPSHOT_EVERY_TICKS = 2; // 30 snapshots/s
/** Seconds a dropped connection may take to come back before its players are removed. */
export const RECONNECT_SECONDS = 45;
export const AUTO_START_MS = 3000;
export const RESULTS_MS = 6000;

/** Room codes avoid look-alike characters (0/O, 1/I/L) so they are easy to read aloud. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const isValidCode = (c: unknown): c is string =>
  typeof c === 'string' && c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch));
export const isCharacterId = (v: unknown): v is CharacterId => typeof v === 'string' && (CHARACTER_IDS as string[]).includes(v);
export const isArenaId = (v: unknown): v is ArenaId => typeof v === 'string' && (ARENA_IDS as string[]).includes(v);

/** Every mode is playable online (the server runs the same deterministic core). */
export type OnlineMode = ModeId;
export const ONLINE_MODES: OnlineMode[] = ['versus', 'solo', 'adventure', 'bossrush'];
export const isOnlineMode = (v: unknown): v is OnlineMode => typeof v === 'string' && (ONLINE_MODES as string[]).includes(v);

/** The player's own profile, sent when one of their devices takes a slot. */
export interface JoinProfile {
  name?: string;
  characterId?: CharacterId;
  colorIndex?: number;
  /** Account credential ("id.token") of the profile owner; extra local players join as guests. */
  auth?: string;
}

/** Player names: short, printable, never empty. */
export function sanitizeName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 12);
  return clean || fallback;
}

// ───────────────────────────── Client → Server ─────────────────────────────

export interface CreateOptions {
  /** Public rooms are reachable through matchmaking; private ones only by code. */
  public?: boolean;
}

export interface Messages {
  /** Add a local player (device) of this connection to the room. */
  join_slot: { localId: string } & JoinProfile;
  leave_slot: { slot: number };
  ready: { slot: number; ready: boolean };
  color: { slot: number; step: 1 | -1 };
  character: { slot: number; step: 1 | -1 };
  mode: { mode: OnlineMode };
  arena: { arena: ArenaId };
  start: Record<string, never>;
  /** One message per client tick with the input of every local slot. */
  input: InputBatch;
}

/** [slot, dirIndex (-1 = none), bomb (0/1), ability (0/1), roll (0/1), jump (0/1)] */
export type InputTuple = [number, number, number, number, number?, number?];
export interface InputBatch {
  seq: number;
  i: InputTuple[];
}

export const encodeInput = (slot: number, inp: PlayerInput): InputTuple => [
  slot,
  inp.move ? DIRS.indexOf(inp.move) : -1,
  inp.bomb ? 1 : 0,
  inp.ability ? 1 : 0,
  inp.roll ? 1 : 0,
  inp.jump ? 1 : 0,
];

/** Never trust a client payload: coerce anything malformed into a safe, empty input. */
export function sanitizeInput(raw: unknown): PlayerInput {
  if (!raw || typeof raw !== 'object') return { move: null, bomb: false, ability: false };
  const r = raw as Record<string, unknown>;
  const move = typeof r.move === 'string' && (DIRS as readonly string[]).includes(r.move) ? (r.move as Dir) : null;
  return { move, bomb: r.bomb === true, ability: r.ability === true, roll: r.roll === true, jump: r.jump === true };
}

/** Validates a wire input batch. Returns null for anything malformed. */
export function parseInputBatch(raw: unknown): { seq: number; inputs: { slot: number; input: PlayerInput }[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Number.isSafeInteger(r.seq) || (r.seq as number) < 0 || !Array.isArray(r.i) || r.i.length > MAX_ROOM_SLOTS) return null;
  const inputs: { slot: number; input: PlayerInput }[] = [];
  for (const t of r.i) {
    if (!Array.isArray(t) || t.length < 3 || t.length > 6) return null;
    const [slot, d, b, a, r, j] = t;
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_ROOM_SLOTS) return null;
    if (!Number.isInteger(d) || d < -1 || d >= DIRS.length) return null;
    inputs.push({ slot, input: { move: d >= 0 ? DIRS[d] : null, bomb: b === 1, ability: a === 1, roll: r === 1, jump: j === 1 } });
  }
  return { seq: r.seq as number, inputs };
}

// ───────────────────────────── Server → Client ─────────────────────────────

export interface LobbySlot {
  slot: number;
  /** sessionId of the connection that owns this player. */
  owner: string;
  /** Client-side id of the local device (e.g. "gp0"), meaningful only to the owner. */
  localId: string;
  name: string;
  colorIndex: number;
  characterId: CharacterId;
  ready: boolean;
  connected: boolean;
  /** Account level (guests: undefined). */
  level?: number;
  /** Cosmetics of a logged-in player (validated by the server against the account inventory). */
  loadout?: Loadout;
}

export interface LobbyInfo {
  code: string;
  isPublic: boolean;
  hostId: string;
  mode: OnlineMode;
  arena: ArenaId;
  phase: 'lobby' | 'playing' | 'results';
  slots: LobbySlot[];
  /** Server time (ms, Date.now) when the auto-start fires, or null. */
  startsAt: number | null;
  serverNow: number;
}

export interface StartInfo {
  config: GameConfig;
  grid: string;
}

/** Dynamic per-player fields (static ones — name, slot, color — travel in StartInfo; the character can change mid-match). */
type SnapPlayer = Omit<PlayerState, 'px' | 'py' | 'name' | 'slot' | 'colorIndex'>;
type SnapEnemy = Omit<EnemyState, 'px' | 'py'>;

/** Authoritative snapshot (~30×/s, msgpack-encoded by Colyseus). Floats rounded to 3 decimals. */
export interface Snapshot {
  t: number;
  ph: Phase;
  pst: number;
  tl: number;
  g: string;
  p: SnapPlayer[];
  b: BombState[];
  f: Flame[];
  u: PowerupState[];
  e: SnapEnemy[];
  m: MineState[];
  mt: MeteorState[];
  ev0: ArenaEventState | null;
  ne: number;
  r: GameResult | null;
  /** Adventure: region flags (bit 0 unlocked, bit 1 cleared), gate open ticks (-1 = sealed), cage states (0 locked, 1 free, 2 rescued). */
  adv?: { r: number[]; g: number[]; c?: number[] };
  /** Boss Rush: the boss in the arena, the queue, how many fell, when the next one enters. */
  bs?: Omit<BossState, 'px' | 'py'> | null;
  bq?: BossId[];
  bd?: number;
  nb?: number;
  /** Last input seq processed, per slot. */
  ack: Record<number, number>;
  /** Gameplay events since the previous snapshot, in order. */
  ev: GameEvent[];
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

export const encodeGrid = (s: GameState) => Array.from(s.grid.cells).join('');

export function encodeSnapshot(s: GameState, ack: Record<number, number>, ev: GameEvent[]): Snapshot {
  return {
    t: s.tick,
    ph: s.phase,
    pst: s.phaseStartTick,
    tl: s.timeLeftTicks,
    g: encodeGrid(s),
    p: s.players.map(({ px: _px, py: _py, name: _n, slot: _s, colorIndex: _ci, ...rest }) => ({
      ...rest,
      x: r3(rest.x),
      y: r3(rest.y),
      speed: r3(rest.speed),
    })),
    b: s.bombs,
    f: s.flames,
    u: s.powerups,
    e: s.enemies.map(({ px: _px, py: _py, ...rest }) => ({ ...rest, x: r3(rest.x), y: r3(rest.y) })),
    m: s.mines,
    mt: s.meteors,
    ev0: s.event,
    ne: s.nextEventTick,
    r: s.result,
    ...(s.adventure
      ? {
          adv: {
            r: s.adventure.regions.map((r) => (r.unlocked ? 1 : 0) | (r.cleared ? 2 : 0)),
            g: s.adventure.gates.map((g) => (g.open ? g.openedTick : -1)),
            c: s.adventure.cages.map((c) => (c.state === 'locked' ? 0 : c.state === 'free' ? 1 : 2)),
          },
        }
      : {}),
    ...(s.mode === 'bossrush'
      ? {
          bs: s.boss ? (({ px: _px, py: _py, ...b }) => ({ ...b, x: r3(b.x), y: r3(b.y) }))(s.boss) : null,
          bq: s.bossQueue,
          bd: s.bossesDefeated,
          nb: s.nextBossTick,
        }
      : {}),
    ack,
    ev,
  };
}

/** Writes a snapshot into a client-side mirror GameState (created from the StartInfo). */
export function applySnapshot(s: GameState, snap: Snapshot) {
  s.tick = snap.t;
  s.phase = snap.ph;
  s.phaseStartTick = snap.pst;
  s.timeLeftTicks = snap.tl;
  for (let i = 0; i < snap.g.length && i < s.grid.cells.length; i++) s.grid.cells[i] = snap.g.charCodeAt(i) - 48;
  for (const sp of snap.p) {
    const p = s.players.find((pp) => pp.id === sp.id);
    if (!p) continue;
    // Previous position = what was last displayed (render interpolation).
    p.px = p.x;
    p.py = p.y;
    Object.assign(p, sp);
  }
  s.bombs = snap.b;
  s.flames = snap.f;
  s.powerups = snap.u;
  const prev = new Map(s.enemies.map((e) => [e.id, e]));
  s.enemies = snap.e.map((e) => {
    const old = prev.get(e.id);
    return { ...e, kind: e.kind ?? 'magmite', px: old?.x ?? e.x, py: old?.y ?? e.y };
  });
  s.mines = snap.m;
  s.meteors = snap.mt;
  s.event = snap.ev0;
  s.nextEventTick = snap.ne;
  s.result = snap.r;
  if (snap.adv && s.adventure) {
    snap.adv.r.forEach((f, i) => {
      const r = s.adventure!.regions[i];
      if (r) {
        r.unlocked = (f & 1) !== 0;
        r.cleared = (f & 2) !== 0;
      }
    });
    snap.adv.c?.forEach((st, i) => {
      const c = s.adventure!.cages[i];
      if (c) c.state = st === 0 ? 'locked' : st === 1 ? 'free' : 'rescued';
    });
    snap.adv.g.forEach((t, i) => {
      const g = s.adventure!.gates[i];
      if (g) {
        g.open = t >= 0;
        g.openedTick = Math.max(0, t);
      }
    });
  }
  if (snap.bs !== undefined) {
    const prev = s.boss;
    s.boss = snap.bs ? { ...snap.bs, px: prev?.x ?? snap.bs.x, py: prev?.y ?? snap.bs.y } : null;
    s.bossQueue = snap.bq ?? [];
    s.bossesDefeated = snap.bd ?? 0;
    s.nextBossTick = snap.nb ?? -1;
  }
}

/** Cryptographically random, unguessable room code. */
export function generateRoomCode(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(CODE_LENGTH * 2);
  let out = '';
  for (let i = 0; out.length < CODE_LENGTH && i < bytes.length; i++) {
    // Rejection sampling keeps the distribution uniform.
    const v = bytes[i];
    if (v < 256 - (256 % CODE_ALPHABET.length)) out += CODE_ALPHABET[v % CODE_ALPHABET.length];
  }
  return out.length === CODE_LENGTH ? out : generateRoomCode(randomBytes);
}
