import { Cell, DIR_VEC, RULES, TICK_DT, secToTicks, type Dir, type PlayerInput } from '@4walls/shared';
import { getCell } from './grid';
import type { GameState, PlayerState } from './types';
import { bombAt, canBombEnter, isFrozen, isSolidForPlayer } from './world';
import { carriesKey } from './adventure';

const EPS = 1e-6;
/** How far off-lane (in cells) a player may be for the game to slide them around a corner into the other lane. */
const CORNER_ASSIST = 0.22;

/**
 * Grid-locked movement with corner assist.
 * Invariant: a player is off-center on at most one axis at a time. To move along an axis the
 * player first slides onto the lane of the cross axis (nearest lane, or the other one when it is
 * open and the player is already leaning into it).
 */
export function movePlayer(s: GameState, p: PlayerState, dir: Dir, dist: number): void {
  const v = DIR_VEC[dir];
  const horizontal = v.x !== 0;
  const sgn = horizontal ? v.x : v.y;
  let m = horizontal ? p.x : p.y; // main axis
  let c = horizontal ? p.y : p.x; // cross axis
  const solid = (mi: number, ci: number) => (horizontal ? isSolidForPlayer(s, p, mi, ci) : isSolidForPlayer(s, p, ci, mi));

  const cm = Math.round(m);
  let lane = Math.round(c);
  const off = c - lane;

  if (Math.abs(off) > EPS) {
    // Need to align on the cross axis first.
    if (solid(cm + sgn, lane)) {
      const other = lane + Math.sign(off);
      if (Math.abs(off) >= CORNER_ASSIST && !solid(cm + sgn, other) && !solid(cm, other)) {
        lane = other;
      } else {
        write(p, horizontal, m, c);
        return;
      }
    }
    const remaining = Math.abs(lane - c);
    const step = Math.min(remaining, dist);
    c += Math.sign(lane - c) * step;
    dist -= step;
    if (Math.abs(c - lane) < EPS) c = lane;
    if (dist <= EPS || c !== lane) {
      write(p, horizontal, m, c);
      return;
    }
  }

  // Aligned on the cross axis: advance along the main axis, stopping at the center of the
  // current cell when the next one is solid.
  const limit = solid(cm + sgn, lane) ? cm : cm + sgn;
  let nm = m + sgn * dist;
  nm = sgn > 0 ? Math.min(nm, Math.max(limit, m)) : Math.max(nm, Math.min(limit, m));
  m = nm;
  write(p, horizontal, m, c);
}

function write(p: PlayerState, horizontal: boolean, m: number, c: number) {
  if (horizontal) {
    p.x = m;
    p.y = c;
  } else {
    p.y = m;
    p.x = c;
  }
}

/** Drop bomb pass-through once the player fully left the bomb's cell. */
export function refreshPassBombs(s: GameState, p: PlayerState) {
  if (p.passBombs.length === 0) return;
  p.passBombs = p.passBombs.filter((id) => {
    const b = s.bombs.find((bb) => bb.id === id);
    if (!b) return false;
    return Math.abs(p.x - b.x) + Math.abs(p.y - b.y) < 1 - EPS;
  });
}

const ICE_SPEED_BONUS = 1.15;

/**
 * One tick of player locomotion — shared by the authoritative simulation and by online
 * client-side prediction so both agree exactly. Handles freezing, the ice-floor event
 * (keep sliding with no input), regular movement and kicking bombs.
 */
export function stepPlayerMovement(s: GameState, p: PlayerState, input: PlayerInput | undefined) {
  p.moving = false;
  if (!p.alive || isFrozen(s, p)) {
    p.slideDir = null;
    return;
  }
  if (p.maneuver) {
    advanceManeuver(s, p);
    refreshPassBombs(s, p);
    return;
  }
  if ((input?.roll || input?.jump) && s.tick >= p.maneuverReadyTick) {
    if (startManeuver(s, p, input.jump ? 'jump' : 'roll', input.move ?? p.facing)) {
      advanceManeuver(s, p);
      refreshPassBombs(s, p);
      return;
    }
  }
  const icy = s.event?.type === 'iceFloor' && s.event.phase === 'active';
  let dir: Dir | null = input?.move ?? null;
  if (!dir && icy) dir = p.slideDir;
  if (dir) {
    p.facing = dir;
    const bx = p.x;
    const by = p.y;
    const turbo = (s.tick < (p.turboUntil ?? 0) ? RULES.turboMult : 1) * (carriesKey(s, p.id) ? 0.9 : 1);
    movePlayer(s, p, dir, p.speed * TICK_DT * (icy ? ICE_SPEED_BONUS : 1) * turbo);
    p.moving = p.x !== bx || p.y !== by;
    if (!p.moving) {
      if (p.canKick) tryKick(s, p, dir);
      p.slideDir = null;
    } else if (icy) {
      p.slideDir = dir;
    }
  }
  if (!icy) p.slideDir = null;
  refreshPassBombs(s, p);
}

// ───────────── roll & jump ─────────────

const easeOutQuad = (k: number) => 1 - (1 - k) * (1 - k);

/**
 * Starts a roll or a jump from the current cell.
 * - Roll: up to RULES.rollCells along `dir`, stopping before anything solid; brief invulnerability.
 * - Jump: two cells, hopping over a bomb (or simply over free floor); one cell if only that fits;
 *   in place otherwise. Airborne players dodge flames and enemies.
 */
export function startManeuver(s: GameState, p: PlayerState, kind: 'roll' | 'jump', dir: Dir): boolean {
  const v = DIR_VEC[dir];
  const cx = Math.round(p.x);
  const cy = Math.round(p.y);
  let n = 0;
  if (kind === 'roll') {
    for (let i = 1; i <= RULES.rollCells; i++) {
      if (isSolidForPlayer(s, p, cx + v.x * i, cy + v.y * i)) break;
      n = i;
    }
  } else {
    const c1 = getCell(s.grid, cx + v.x, cy + v.y);
    // Hop over a bomb, open floor or a single cell of lava (never land in it).
    const overable = c1 === Cell.Floor || c1 === Cell.Lava || (c1 === Cell.Block && s.tick < p.ghostUntil);
    if (overable && !isSolidForPlayer(s, p, cx + v.x * 2, cy + v.y * 2) && !bombAt(s, cx + v.x * 2, cy + v.y * 2)) n = 2;
    else if (!isSolidForPlayer(s, p, cx + v.x, cy + v.y)) n = 1;
  }
  const sec = kind === 'roll' ? RULES.rollSec : RULES.jumpSec * (n === 0 ? 0.7 : 1);
  const dur = Math.max(1, secToTicks(sec));
  p.facing = dir;
  p.slideDir = null;
  p.maneuver = { kind, dir, fromX: p.x, fromY: p.y, toX: cx + v.x * n, toY: cy + v.y * n, startTick: s.tick, endTick: s.tick + dur };
  p.maneuverReadyTick = s.tick + dur + secToTicks(kind === 'roll' ? RULES.rollCooldownSec : RULES.jumpCooldownSec);
  s.events.push({ type: kind === 'roll' ? 'playerRolled' : 'playerJumped', playerId: p.id, dir });
  return true;
}

export function advanceManeuver(s: GameState, p: PlayerState) {
  const m = p.maneuver!;
  const k = Math.min(1, (s.tick - m.startTick + 1) / Math.max(1, m.endTick - m.startTick));
  const e = m.kind === 'roll' ? easeOutQuad(k) : k;
  p.x = m.fromX + (m.toX - m.fromX) * e;
  p.y = m.fromY + (m.toY - m.fromY) * e;
  p.moving = true;
  p.facing = m.dir;
  if (k >= 1) {
    p.x = m.toX;
    p.y = m.toY;
    p.maneuver = null;
    if (m.kind === 'jump') s.events.push({ type: 'playerLanded', playerId: p.id, x: p.x, y: p.y });
  }
}

export const kickIntervalTicks = () => Math.max(1, Math.round(1 / (RULES.kickSpeed * TICK_DT)));

/** Kick: walking (centered) into a resting bomb sends it sliding until something stops it. */
export function tryKick(s: GameState, p: PlayerState, dir: Dir) {
  const v = DIR_VEC[dir];
  const cx = Math.round(p.x);
  const cy = Math.round(p.y);
  if (Math.abs(p.x - cx) > 0.05 || Math.abs(p.y - cy) > 0.05) return false;
  const b = bombAt(s, cx + v.x, cy + v.y);
  if (!b || b.slideDir || s.tick < b.flightUntil || p.passBombs.includes(b.id)) return false;
  if (!canBombEnter(s, b.x + v.x, b.y + v.y)) return false;
  b.slideDir = dir;
  b.nextSlideTick = s.tick + 1;
  s.events.push({ type: 'bombKicked', bombId: b.id, playerId: p.id });
  return true;
}

