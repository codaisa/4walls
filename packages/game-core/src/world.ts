import { Cell, RULES, secToTicks } from '@4walls/shared';
import { getCell } from './grid';
import type { BombState, Flame, GameState, PlayerState } from './types';

export const cellOf = (v: number) => Math.round(v);

export function bombAt(s: GameState, x: number, y: number): BombState | undefined {
  return s.bombs.find((b) => b.x === x && b.y === y);
}

/** Active flames on a cell (several blasts may overlap). */
export function flamesAt(s: GameState, x: number, y: number): Flame[] {
  return s.flames.filter((f) => f.x === x && f.y === y && f.untilTick > s.tick);
}

export function flameAt(s: GameState, x: number, y: number) {
  return s.flames.find((f) => f.x === x && f.y === y && f.untilTick > s.tick);
}

export function powerupAt(s: GameState, x: number, y: number) {
  return s.powerups.find((p) => p.x === x && p.y === y);
}

export function mineAt(s: GameState, x: number, y: number) {
  return s.mines.find((m) => m.x === x && m.y === y);
}

export function isOpenFloor(s: GameState, x: number, y: number) {
  return getCell(s.grid, x, y) === Cell.Floor;
}

/**
 * Is cell (x, y) blocking for this player?
 * - Walls always block; destructible blocks unless the Ghost power is active.
 * - Bombs block unless the player wears Boots or is still standing on that bomb.
 */
export function isSolidForPlayer(s: GameState, p: PlayerState, x: number, y: number) {
  const c = getCell(s.grid, x, y);
  if (c === Cell.Wall) return true;
  if (c === Cell.Block && s.tick >= p.ghostUntil) return true;
  if (p.hasBoots) return false;
  const b = bombAt(s, x, y);
  return !!b && !p.passBombs.includes(b.id);
}

/** Simultaneous bombs limit counts regular bombs only (ability mini-bombs are extra). */
export function activeBombCount(s: GameState, ownerId: string) {
  let n = 0;
  for (const b of s.bombs) if (b.ownerId === ownerId && !b.extra) n++;
  return n;
}

/** Can a sliding (kicked) bomb move into this cell? Stops at walls, blocks, bombs, players and enemies. */
export function canBombEnter(s: GameState, x: number, y: number) {
  if (!isOpenFloor(s, x, y) || bombAt(s, x, y)) return false;
  if (s.players.some((p) => p.alive && Math.abs(p.x - x) < 0.9 && Math.abs(p.y - y) < 0.9)) return false;
  if (s.enemies.some((e) => e.alive && Math.abs(e.x - x) < 0.9 && Math.abs(e.y - y) < 0.9)) return false;
  return true;
}

/**
 * Rolling (the first frames) and jumping (while off the ground) dodge flames, enemies and freezes.
 */
export function isEvading(s: GameState, p: PlayerState) {
  const m = p.maneuver;
  if (!m) return false;
  if (m.kind === 'roll') return s.tick < m.startTick + secToTicks(RULES.rollInvulnSec);
  const k = (s.tick - m.startTick) / Math.max(1, m.endTick - m.startTick);
  return k > 0.12 && k < 0.88;
}

export const isFrozen =(s: GameState, p: { frozenUntil: number }) => s.tick < p.frozenUntil;

export const newId = (s: GameState) => s.nextId++;
