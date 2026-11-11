import { DIRS, DIR_VEC, OPPOSITE, RULES, TICK_DT, type Dir } from '@4walls/shared';
import { randInt, nextRandom } from './rng';
import type { EnemyState, GameState } from './types';
import { bombAt, isOpenFloor, newId } from './world';

const passable = (s: GameState, x: number, y: number) => isOpenFloor(s, x, y) && !bombAt(s, x, y);

export function spawnEnemies(s: GameState, count: number) {
  const free: { x: number; y: number }[] = [];
  for (let y = 1; y < s.grid.h - 1; y++)
    for (let x = 1; x < s.grid.w - 1; x++) {
      if (!isOpenFloor(s, x, y)) continue;
      const farFromPlayers = s.players.every((p) => Math.abs(p.x - x) + Math.abs(p.y - y) >= 7);
      if (farFromPlayers) free.push({ x, y });
    }
  for (let i = 0; i < count && free.length; i++) {
    const [c] = free.splice(randInt(s, free.length), 1);
    const e: EnemyState = {
      id: newId(s), kind: 'magmite', x: c.x, y: c.y, px: c.x, py: c.y, dir: null, tx: c.x, ty: c.y, alive: true, diedTick: -1, frozenUntil: 0, regionId: -1,
    };
    s.enemies.push(e);
  }
}

function chooseDir(s: GameState, e: EnemyState): Dir | null {
  const options = DIRS.filter((d) => passable(s, e.x + DIR_VEC[d].x, e.y + DIR_VEC[d].y));
  if (!options.length) return null;
  if (e.dir && options.includes(e.dir) && nextRandom(s) < 0.72) return e.dir;
  const forward = options.filter((d) => !e.dir || d !== OPPOSITE[e.dir]);
  const pool = forward.length ? forward : options;
  return pool[randInt(s, pool.length)];
}

/** Magmites wander cell to cell: at each cell center they keep going or pick a new open direction. */
export function updateEnemies(s: GameState) {
  const step = RULES.enemySpeed * TICK_DT;
  for (const e of s.enemies) {
    e.px = e.x;
    e.py = e.y;
    if (!e.alive || s.tick < e.frozenUntil) continue;
    let budget = step;
    while (budget > 1e-6) {
      if (e.x === e.tx && e.y === e.ty) {
        e.dir = chooseDir(s, e);
        if (!e.dir) break;
        e.tx = e.x + DIR_VEC[e.dir].x;
        e.ty = e.y + DIR_VEC[e.dir].y;
      }
      // A bomb dropped in our path: turn back to the cell we came from.
      if (!passable(s, e.tx, e.ty) && e.dir) {
        if (Number.isInteger(e.x) && Number.isInteger(e.y)) {
          e.tx = e.x;
          e.ty = e.y;
          e.dir = null;
          break;
        }
        const back = OPPOSITE[e.dir];
        const v = DIR_VEC[back];
        e.dir = back;
        e.tx = v.x < 0 ? Math.floor(e.x) : v.x > 0 ? Math.ceil(e.x) : e.x;
        e.ty = v.y < 0 ? Math.floor(e.y) : v.y > 0 ? Math.ceil(e.y) : e.y;
      }
      const dx = e.tx - e.x;
      const dy = e.ty - e.y;
      const d = Math.abs(dx) + Math.abs(dy);
      const mv = Math.min(d, budget);
      if (d > 0) {
        e.x += (dx / d) * mv;
        e.y += (dy / d) * mv;
      }
      budget -= mv;
      if (Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y) < 1e-6) {
        e.x = e.tx;
        e.y = e.ty;
      }
      if (d === 0) break;
    }
  }
}
