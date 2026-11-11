import { Cell, CHARACTERS, RULES, secToTicks, type AbilityId, type CharacterId } from '@4walls/shared';
import { detonate, detonateRemote, spawnBomb, tryPlaceExtraBomb } from './bombs';
import { getCell } from './grid';
import { movePlayer } from './movement';
import type { GameState, PlayerState } from './types';
import { bombAt, cellOf, isFrozen, mineAt, newId } from './world';

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
