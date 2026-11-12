import { Cell, DIRS, DIR_VEC, POWERUPS, RULES, secToTicks, type BombKind, type Dir, type PowerupType } from '@4walls/shared';
import { cellIndex, getCell, inBounds, setCell } from './grid';
import { kickIntervalTicks } from './movement';
import { nextRandom, pickWeighted } from './rng';
import type { BombState, Flame, GameState, PlayerState } from './types';
import { activeBombCount, bombAt, canBombEnter, cellOf, flamesAt, mineAt, newId } from './world';

export interface BlastContext {
  chain: BombState[];
  destroyedThisTick: Set<number>;
}

/**
 * Bomb kinds are data-driven: each declares how long its flames last. Propagation is the shared
 * cross pattern; what a flame *does* on contact (kill, freeze...) lives in combat.ts.
 * Adding a kind = one entry here + its contact rule.
 */
export interface BombKindDef {
  kind: BombKind;
  flameSec: number;
}
export const BOMB_KINDS: Record<BombKind, BombKindDef> = {
  normal: { kind: 'normal', flameSec: RULES.flameSec },
  fire: { kind: 'fire', flameSec: RULES.fireFlameSec },
  ice: { kind: 'ice', flameSec: RULES.flameSec },
};

function propagate(s: GameState, bomb: BombState, ctx: BlastContext): Flame[] {
  const until = s.tick + secToTicks(BOMB_KINDS[bomb.kind].flameSec);
  const mk = (x: number, y: number, part: Flame['part'], dir: Dir | null): Flame => ({
    x, y, part, dir, bombId: bomb.id, ownerId: bomb.ownerId, bornTick: s.tick, untilTick: until, kind: bomb.kind,
  });
  const flames: Flame[] = [mk(bomb.x, bomb.y, 'center', null)];
  for (const d of DIRS) {
    const v = DIR_VEC[d];
    for (let i = 1; i <= bomb.range; i++) {
      const x = bomb.x + v.x * i;
      const y = bomb.y + v.y * i;
      const cell = getCell(s.grid, x, y);
      if (cell === Cell.Wall) break;
      if (cell === Cell.Cracked) {
        // Adventure secret: the cracked wall gives way.
        flames.push(mk(x, y, 'end', d));
        setCell(s.grid, x, y, Cell.Floor);
        ctx.destroyedThisTick.add(cellIndex(s.grid, x, y));
        s.events.push({ type: 'secretFound', x, y, byId: bomb.ownerId });
        break;
      }
      const idx = cellIndex(s.grid, x, y);
      if (cell === Cell.Block || ctx.destroyedThisTick.has(idx)) {
        flames.push(mk(x, y, 'end', d));
        if (cell === Cell.Block) destroyBlock(s, x, y, bomb.ownerId, ctx);
        break;
      }
      const other = bombAt(s, x, y);
      if (other) {
        flames.push(mk(x, y, 'end', d));
        ctx.chain.push(other);
        break;
      }
      flames.push(mk(x, y, i === bomb.range ? 'end' : 'arm', d));
    }
  }
  return flames;
}

interface NewBomb {
  ownerId: string;
  x: number;
  y: number;
  range: number;
  kind?: BombKind;
  remote?: boolean;
  extra?: boolean;
  /** No "bomb placed" feedback (mines, meteors). */
  silent?: boolean;
}

/** Low-level placement (no ownership rules). Used by players, abilities, mines and meteors. */
export function spawnBomb(s: GameState, nb: NewBomb): BombState {
  const remote = nb.remote ?? false;
  const bomb: BombState = {
    id: newId(s),
    ownerId: nb.ownerId,
    x: nb.x,
    y: nb.y,
    range: nb.range,
    placedTick: s.tick,
    detonateTick: s.tick + secToTicks(remote ? RULES.remoteMaxSec : RULES.fuseSec),
    kind: nb.kind ?? 'normal',
    remote,
    extra: nb.extra ?? false,
    slideDir: null,
    nextSlideTick: 0,
    fromX: nb.x,
    fromY: nb.y,
    movedTick: s.tick,
    flightUntil: 0,
  };
  s.bombs.push(bomb);
  // Everyone overlapping the cell may walk off the new bomb.
  for (const other of s.players) {
    if (other.alive && Math.abs(other.x - nb.x) + Math.abs(other.y - nb.y) < 1) other.passBombs.push(bomb.id);
  }
  if (!nb.silent) s.events.push({ type: 'bombPlaced', bombId: bomb.id, x: nb.x, y: nb.y, ownerId: nb.ownerId, kind: bomb.kind });
  return bomb;
}

function canPlaceAt(s: GameState, x: number, y: number) {
  return getCell(s.grid, x, y) === Cell.Floor && !bombAt(s, x, y) && !mineAt(s, x, y);
}

export function tryPlaceBomb(s: GameState, p: PlayerState): BombState | null {
  if (!p.alive || s.tick < p.frozenUntil) return null;
  const x = cellOf(p.x);
  const y = cellOf(p.y);
  // Glove: pressing bomb on top of your own bomb throws it instead.
  if (p.canThrow) {
    const own = bombAt(s, x, y);
    if (own && own.ownerId === p.id && s.tick >= own.flightUntil) {
      throwBomb(s, p, own);
      return null;
    }
  }
  if (!canPlaceAt(s, x, y)) return null;
  if (activeBombCount(s, p.id) >= p.maxBombs) return null;
  let kind: BombKind = 'normal';
  if (p.special && p.special.charges > 0) {
    kind = p.special.kind;
    p.special.charges--;
    if (p.special.charges <= 0) p.special = null;
  }
  return spawnBomb(s, { ownerId: p.id, x, y, range: p.range, kind, remote: p.hasRemote });
}

/**
 * Throws a bomb RULES.throwCells ahead (or the first free floor up to throwMaxCells), flying over
 * walls, blocks and everything else. It can't explode or be kicked while in the air.
 */
export function throwBomb(s: GameState, p: PlayerState, b: BombState): boolean {
  const v = DIR_VEC[p.facing];
  for (let d = RULES.throwCells; d <= RULES.throwMaxCells; d++) {
    const tx = b.x + v.x * d;
    const ty = b.y + v.y * d;
    if (!inBounds(s.grid, tx, ty)) break;
    if (getCell(s.grid, tx, ty) !== Cell.Floor || bombAt(s, tx, ty) || mineAt(s, tx, ty)) continue;
    const flight = secToTicks(RULES.throwFlightSec);
    s.events.push({ type: 'bombThrown', bombId: b.id, playerId: p.id, fromX: b.x, fromY: b.y, x: tx, y: ty });
    b.fromX = b.x;
    b.fromY = b.y;
    b.x = tx;
    b.y = ty;
    b.movedTick = s.tick;
    b.flightUntil = s.tick + flight;
    b.slideDir = null;
    b.detonateTick = Math.max(b.detonateTick, b.flightUntil + 12);
    for (const other of s.players) other.passBombs = other.passBombs.filter((id) => id !== b.id);
    return true;
  }
  return false;
}

/** Ability mini-bomb: range 1, ignores the bomb limit. */
export function tryPlaceExtraBomb(s: GameState, p: PlayerState): BombState | null {
  const x = cellOf(p.x);
  const y = cellOf(p.y);
  if (!canPlaceAt(s, x, y)) return null;
  return spawnBomb(s, { ownerId: p.id, x, y, range: 1, extra: true });
}

/** Detonates the owner's oldest remote bomb. Returns true if one went off. */
export function detonateRemote(s: GameState, p: PlayerState) {
  const b = s.bombs.filter((bb) => bb.ownerId === p.id && bb.remote).sort((a, c) => a.placedTick - c.placedTick)[0];
  if (!b) return false;
  detonate(s, b);
  return true;
}

export function destroyBlock(s: GameState, x: number, y: number, byId: string, ctx?: BlastContext) {
  setCell(s.grid, x, y, Cell.Floor);
  ctx?.destroyedThisTick.add(cellIndex(s.grid, x, y));
  const owner = s.players.find((p) => p.id === byId);
  if (owner) owner.blocksDestroyed++;
  s.events.push({ type: 'blockDestroyed', x, y, byId });
  if (nextRandom(s) < RULES.powerupChance) {
    const defs = Object.values(POWERUPS);
    const type: PowerupType = pickWeighted(s, defs, (d) => d.weight).type;
    const id = newId(s);
    s.powerups.push({ id, type, x, y, bornTick: s.tick });
    s.events.push({ type: 'powerupSpawned', id, x, y, powerup: type });
  }
}

/** Detonate a bomb and everything it chains into, within the same tick. */
export function detonate(s: GameState, first: BombState, ctx?: BlastContext) {
  const c: BlastContext = ctx ?? { chain: [], destroyedThisTick: new Set() };
  c.chain.push(first);
  while (c.chain.length) {
    const bomb = c.chain.shift()!;
    const i = s.bombs.indexOf(bomb);
    if (i === -1) continue; // already exploded
    s.bombs.splice(i, 1);
    const flames = propagate(s, bomb, c);
    for (const f of flames) {
      // Fresh blasts burn power-ups that were already lying there (not the ones just revealed).
      const pi = s.powerups.findIndex((pu) => pu.x === f.x && pu.y === f.y && pu.bornTick < s.tick);
      if (pi !== -1) {
        const [pu] = s.powerups.splice(pi, 1);
        s.events.push({ type: 'powerupBurned', id: pu.id, x: pu.x, y: pu.y });
      }
      s.flames.push(f);
    }
    s.events.push({
      type: 'explosion',
      bombId: bomb.id,
      x: bomb.x,
      y: bomb.y,
      ownerId: bomb.ownerId,
      kind: bomb.kind,
      cells: flames.map((f) => ({ x: f.x, y: f.y })),
    });
  }
}

/** Kicked bombs advance one cell per interval and stop at the first obstacle. */
function slideBombs(s: GameState) {
  for (const b of s.bombs) {
    if (!b.slideDir || s.tick < b.nextSlideTick || s.tick < b.flightUntil) continue;
    const v = DIR_VEC[b.slideDir];
    if (!canBombEnter(s, b.x + v.x, b.y + v.y)) {
      b.slideDir = null;
      continue;
    }
    b.fromX = b.x;
    b.fromY = b.y;
    b.x += v.x;
    b.y += v.y;
    b.movedTick = s.tick;
    b.nextSlideTick = s.tick + kickIntervalTicks();
  }
}

export function updateBombs(s: GameState) {
  slideBombs(s);
  const ctx: BlastContext = { chain: [], destroyedThisTick: new Set() };
  // Fuse ran out, or the bomb sits in a live flame (lingering fire, a kicked bomb sliding into a blast).
  const due = s.bombs.filter((b) => s.tick >= b.flightUntil && (b.detonateTick <= s.tick || flamesAt(s, b.x, b.y).some((f) => f.bombId !== b.id)));
  for (const b of due) detonate(s, b, ctx);
  s.flames = s.flames.filter((f) => f.untilTick > s.tick);
}
