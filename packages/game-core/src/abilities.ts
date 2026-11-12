import { Cell, CHARACTERS, DIR_VEC, DIRS, POWERUPS, RULES, secToTicks, type AbilityId, type CharacterId, type Dir, type PowerupType } from '@4walls/shared';
import { detonate, detonateRemote, spawnBomb, tryPlaceBomb, tryPlaceExtraBomb } from './bombs';
import { getCell } from './grid';
import { movePlayer } from './movement';
import { pickWeighted } from './rng';
import type { GameState, PlayerState } from './types';
import { bombAt, cellOf, isEvading, isFrozen, mineAt, newId, powerupAt } from './world';

/** Each ability returns true when it actually happened (only then the cooldown starts). */
type AbilityFn = (s: GameState, p: PlayerState) => boolean;

export const ABILITIES: Record<AbilityId, AbilityFn> = {
  /** Bombito: a range-1 mini-bomb that ignores the bomb limit. */
  miniBomb: (s, p) => !!tryPlaceExtraBomb(s, p),

  /** Ninja: dash up to N cells in the facing direction, stopping at obstacles. */
  dash: (s, p) => {
    const fromX = p.x;
    const fromY = p.y;
    const step = 0.25;
    for (let i = 0; i < RULES.dashCells / step; i++) {
      const bx = p.x;
      const by = p.y;
      movePlayer(s, p, p.facing, step);
      if (p.x === bx && p.y === by) break;
    }
    const moved = Math.abs(p.x - fromX) + Math.abs(p.y - fromY) > 0.1;
    if (moved) {
      p.px = p.x; // teleport-like: no interpolation smear
      p.py = p.y;
    }
    return moved;
  },

  /** Engenheiro: plant an armed-after-1s mine; at most two at a time. */
  mine: (s, p) => {
    const x = cellOf(p.x);
    const y = cellOf(p.y);
    if (getCell(s.grid, x, y) !== Cell.Floor || bombAt(s, x, y) || mineAt(s, x, y)) return false;
    if (s.mines.filter((m) => m.ownerId === p.id).length >= RULES.maxMines) return false;
    s.mines.push({
      id: newId(s),
      ownerId: p.id,
      x,
      y,
      armedTick: s.tick + secToTicks(RULES.mineArmSec),
      expireTick: s.tick + secToTicks(RULES.mineLifeSec),
    });
    return true;
  },

  /** Luiz Bombzaga: an accordion blast pushes nearby bombs away (they slide like kicked) and stuns Magmitos. */
  forro: (s, p) => {
    const R = RULES.forroRadius;
    const px = cellOf(p.x);
    const py = cellOf(p.y);
    for (const b of s.bombs) {
      if (s.tick < b.flightUntil) continue;
      const dx = b.x - px;
      const dy = b.y - py;
      if (Math.abs(dx) + Math.abs(dy) > R) continue;
      const dir: Dir = dx === 0 && dy === 0 ? p.facing : Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      b.slideDir = dir;
      b.nextSlideTick = s.tick;
      p.passBombs = p.passBombs.filter((id) => id !== b.id);
    }
    const stun = s.tick + secToTicks(RULES.forroStunSec);
    for (const e of s.enemies) if (e.alive && Math.abs(e.x - p.x) + Math.abs(e.y - p.y) <= R + 0.5) e.frozenUntil = Math.max(e.frozenUntil, stun);
    return true;
  },

  /** Tiringão: a contagious laugh freezes Magmitos (and rivals, in Versus) around him. */
  laugh: (s, p) => {
    const R2 = RULES.laughRadius * RULES.laughRadius;
    const until = s.tick + secToTicks(RULES.laughSec);
    for (const e of s.enemies) if (e.alive && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= R2) e.frozenUntil = Math.max(e.frozenUntil, until);
    if (s.mode === 'versus') {
      for (const o of s.players) {
        if (o === p || !o.alive || s.tick < o.invulnUntil || isEvading(s, o)) continue;
        if ((o.x - p.x) ** 2 + (o.y - p.y) ** 2 > R2) continue;
        o.frozenUntil = Math.max(o.frozenUntil, until);
        o.slideDir = null;
      }
    }
    return true;
  },

  /**
   * Bombião: a blunderbuss blast up to N cells ahead. It flies over open floor and bursts (range 1)
   * at the last free cell before an obstacle; a bomb in its path is set off instead.
   */
  blunderbuss: (s, p) => {
    const v = DIR_VEC[p.facing];
    let x = cellOf(p.x);
    let y = cellOf(p.y);
    let target: { x: number; y: number } | null = null;
    for (let i = 1; i <= RULES.blunderbussCells; i++) {
      const nx = x + v.x;
      const ny = y + v.y;
      const hitBomb = bombAt(s, nx, ny);
      if (hitBomb) {
        detonate(s, hitBomb);
        return true;
      }
      if (getCell(s.grid, nx, ny) !== Cell.Floor) break;
      x = nx;
      y = ny;
      target = { x, y };
      if (s.enemies.some((e) => e.alive && cellOf(e.x) === nx && cellOf(e.y) === ny)) break;
    }
    if (!target) return false;
    // The shooter is braced for the recoil: their own short blast never hurts them.
    p.invulnUntil = Math.max(p.invulnUntil, s.tick + secToTicks(RULES.flameSec + 0.1));
    detonate(s, spawnBomb(s, { ownerId: p.id, x: target.x, y: target.y, range: 1, extra: true, silent: true }));
    return true;
  },

  /** Rei Pelota: a regular bomb, already kicked forward. */
  bicycle: (s, p) => {
    const b = tryPlaceBomb(s, p);
    if (!b) return false;
    b.slideDir = p.facing;
    b.nextSlideTick = s.tick;
    return true;
  },

  /** Ayrton Senha: double speed for a moment. */
  turbo: (s, p) => {
    p.turboUntil = s.tick + secToTicks(RULES.turboSec);
    return true;
  },

  /** Silvio Bombos: "Quem quer bomba?" — a random power-up appears next to him. */
  prize: (s, p) => {
    const x = cellOf(p.x);
    const y = cellOf(p.y);
    const order: Dir[] = [p.facing, ...DIRS.filter((d) => d !== p.facing)];
    for (const d of order) {
      const cx = x + DIR_VEC[d].x;
      const cy = y + DIR_VEC[d].y;
      if (getCell(s.grid, cx, cy) !== Cell.Floor || bombAt(s, cx, cy) || mineAt(s, cx, cy) || powerupAt(s, cx, cy)) continue;
      const type: PowerupType = pickWeighted(s, Object.values(POWERUPS), (def) => def.weight).type;
      const id = newId(s);
      s.powerups.push({ id, type, x: cx, y: cy, bornTick: s.tick });
      s.events.push({ type: 'powerupSpawned', id, x: cx, y: cy, powerup: type });
      return true;
    }
    return false;
  },
};

/**
 * The ability button: detonates a remote bomb if the player has one out, otherwise fires the
 * character's ability (subject to cooldown).
 */
export function useAbility(s: GameState, p: PlayerState) {
  if (!p.alive || isFrozen(s, p)) return;
  if (p.hasRemote && detonateRemote(s, p)) return;
  if (s.tick < p.abilityReadyTick) return;
  const def = CHARACTERS[p.characterId as CharacterId] ?? CHARACTERS.bombito;
  const fromX = p.x;
  const fromY = p.y;
  if (!ABILITIES[def.ability](s, p)) return;
  p.abilityReadyTick = s.tick + secToTicks(def.cooldownSec);
  s.events.push({ type: 'abilityUsed', playerId: p.id, ability: def.ability, x: p.x, y: p.y, fromX, fromY });
}

/** Armed mines explode when anyone but their owner (or an enemy) steps on them, when hit by a blast, or when they expire. */
export function updateMines(s: GameState) {
  for (const m of [...s.mines]) {
    const armed = s.tick >= m.armedTick;
    const stepped =
      armed &&
      (s.players.some((p) => p.alive && p.id !== m.ownerId && cellOf(p.x) === m.x && cellOf(p.y) === m.y) ||
        s.enemies.some((e) => e.alive && cellOf(e.x) === m.x && cellOf(e.y) === m.y));
    const burned = s.flames.some((f) => f.x === m.x && f.y === m.y && f.untilTick > s.tick);
    if (!stepped && !burned && s.tick < m.expireTick) continue;
    s.mines.splice(s.mines.indexOf(m), 1);
    s.events.push({ type: 'mineTriggered', mineId: m.id, x: m.x, y: m.y });
    const occupied = bombAt(s, m.x, m.y);
    if (occupied) detonate(s, occupied);
    else detonate(s, spawnBomb(s, { ownerId: m.ownerId, x: m.x, y: m.y, range: 1, extra: true, silent: true }));
  }
}
