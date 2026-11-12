import { Cell, DIRS, DIR_VEC, OPPOSITE, RULES, TICK_DT, secToTicks, type Dir } from '@4walls/shared';
import { spawnBomb } from './bombs';
import { addCoins } from './expedition';
import { getCell } from './grid';
import { kickIntervalTicks } from './movement';
import { randInt, nextRandom } from './rng';
import type { EnemyState, GameState } from './types';
import { bombAt, isOpenFloor, newId } from './world';

/** Task 3: camps are safe — no enemy ever walks (or leaps) into one. */
function campCell(s: GameState, x: number, y: number) {
  const adv = s.adventure;
  if (!adv) return false;
  const g = s.grid;
  if (x < g.x0 || y < g.y0 || x >= g.x0 + g.w || y >= g.y0 + g.h) return false;
  const id = adv.regionOf[(y - g.y0) * g.w + (x - g.x0)];
  return id >= 0 && adv.regions.some((r) => r.id === id && r.objective.kind === 'camp');
}

const passable = (s: GameState, x: number, y: number) => isOpenFloor(s, x, y) && !bombAt(s, x, y) && !campCell(s, x, y);

export function spawnEnemies(s: GameState, count: number) {
  const free: { x: number; y: number }[] = [];
  for (let y = s.grid.y0 + 1; y < s.grid.y0 + s.grid.h - 1; y++)
    for (let x = s.grid.x0 + 1; x < s.grid.x0 + s.grid.w - 1; x++) {
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

/**
 * Fagulha: wanders like a Magmito until a player stands in a straight, clear line within sight.
 * Then it stops and glows (the warning), charges along that line until it hits something, and rests.
 */
function updateSpark(s: GameState, e: EnemyState): boolean {
  const mode = e.mode ?? 'wander';
  const until = e.modeUntil ?? 0;
  if (mode === 'alert') {
    if (s.tick < until) return true;
    e.mode = 'charge';
    return true;
  }
  if (mode === 'rest') {
    if (s.tick < until) return true;
    e.mode = 'wander';
    return false;
  }
  if (mode === 'charge' && e.dir) {
    let budget = RULES.sparkChargeSpeed * TICK_DT * (e.speedMul ?? 1);
    while (budget > 1e-6) {
      if (e.x === e.tx && e.y === e.ty) {
        const v = DIR_VEC[e.dir];
        if (!passable(s, e.x + v.x, e.y + v.y)) {
          e.mode = 'rest';
          e.modeUntil = s.tick + Math.round(RULES.sparkRestSec / TICK_DT);
          return true;
        }
        e.tx = e.x + v.x;
        e.ty = e.y + v.y;
      }
      const dx = e.tx - e.x;
      const dy = e.ty - e.y;
      const d = Math.abs(dx) + Math.abs(dy);
      const mv = Math.min(d, budget);
      e.x += (dx / d) * mv;
      e.y += (dy / d) * mv;
      budget -= mv;
      if (Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y) < 1e-6) {
        e.x = e.tx;
        e.y = e.ty;
      }
    }
    return true;
  }
  // Wandering: at cell centers, look down the four lines for a player.
  if (e.x === e.tx && e.y === e.ty) {
    for (const d of DIRS) {
      const v = DIR_VEC[d];
      for (let k = 1; k <= RULES.sparkSight; k++) {
        const cx = e.x + v.x * k;
        const cy = e.y + v.y * k;
        if (!passable(s, cx, cy)) break;
        if (s.players.some((p) => p.alive && Math.round(p.x) === cx && Math.round(p.y) === cy)) {
          e.dir = d;
          e.mode = 'alert';
          e.modeUntil = s.tick + Math.round(RULES.sparkAlertSec / TICK_DT);
          s.events.push({ type: 'sparkAlert', enemyId: e.id, x: e.x, y: e.y });
          return true;
        }
      }
    }
  }
  return false;
}

/** Magmites wander cell to cell: at each cell center they keep going or pick a new open direction. */
export function updateEnemies(s: GameState) {
  const step = RULES.enemySpeed * TICK_DT;
  for (const e of s.enemies) {
    e.px = e.x;
    e.py = e.y;
    if (!e.alive || s.tick < e.frozenUntil) continue;
    if (e.kind === 'mimic') {
      updateMimic(s, e);
      continue;
    }
    if (e.kind === 'mote') {
      updateMote(s, e);
      continue;
    }
    if (e.kind === 'spark' && updateSpark(s, e)) continue;
    let budget = (e.kind === 'spark' ? RULES.sparkSpeed * TICK_DT : step) * (e.speedMul ?? 1);
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

// ───────────────────────────── B4: elites and the Mimic ─────────────────────────────

export const ELITE_MAGMITE_HP = 3;
export const MIMIC_HP = 4;
export const MIMIC = {
  speed: 2.1,
  revealSec: 1.1,
  crouchSec: 0.6,
  leapSec: 0.7,
  leapEverySec: 3.6,
  leapRange: 6,
  chewSec: 0.9,
  spitFuseSec: 1.5,
  spitRange: 2,
};

/** A new enemy with the usual defaults. */
export function makeEnemy(s: GameState, kind: EnemyState['kind'], x: number, y: number, regionId: number, extra: Partial<EnemyState> = {}): EnemyState {
  return { id: newId(s), kind, x, y, px: x, py: y, dir: null, tx: x, ty: y, alive: true, diedTick: -1, frozenUntil: 0, regionId, ...extra };
}

/** An elite Fagulha bursts into two small ones on open cells around it. */
function splitSpark(s: GameState, e: EnemyState) {
  const x = Math.round(e.x);
  const y = Math.round(e.y);
  const cells = [{ x, y }, ...DIRS.map((d) => ({ x: x + DIR_VEC[d].x, y: y + DIR_VEC[d].y }))].filter((c) => passable(s, c.x, c.y));
  // Rest a moment first so the blast that split it doesn't take the children too.
  for (let k = 0; k < 2; k++) {
    const c = cells[Math.min(cells.length - 1, k + 1)] ?? { x, y };
    s.enemies.push(makeEnemy(s, 'spark', c.x, c.y, e.regionId, { speedMul: e.speedMul, mode: 'rest', modeUntil: s.tick + secToTicks(0.8), frozenUntil: s.tick + secToTicks(0.5) }));
  }
  const reg = s.adventure?.regions.find((r) => r.id === e.regionId);
  if (reg && reg.objective.kind === 'clear' && !reg.objective.done) reg.objective.goal += 2;
  s.events.push({ type: 'eliteSplit', enemyId: e.id, x: e.x, y: e.y });
}

/** The Mimic falls: its chest comes back, double and real, where it died (or at home). */
function mimicDefeated(s: GameState, e: EnemyState) {
  const pr = s.adventure?.props.find((q) => q.id === e.propId);
  s.events.push({ type: 'mimicDefeated', enemyId: e.id, x: e.x, y: e.y });
  if (!pr) return;
  const x = Math.round(e.x);
  const y = Math.round(e.y);
  if (getCell(s.grid, x, y) === Cell.Floor && !bombAt(s, x, y)) {
    pr.x = x;
    pr.y = y;
  }
  pr.state = 'closed';
  pr.hp = 2;
  pr.tick = s.tick;
}

/** Bookkeeping when an enemy dies (combat.ts calls this). */
export function enemyDown(s: GameState, e: EnemyState) {
  if (e.kind === 'spark' && e.elite) splitSpark(s, e);
  if (e.kind === 'mimic') mimicDefeated(s, e);
  if (e.elite) addCoins(s, 6, e.x, e.y);
  if (e.kind === 'mimic') addCoins(s, 20, e.x, e.y);
}

/** A chest turns out to be a Mimic: it bites whoever opened it (a shield) and wakes. */
export function wakeMimic(s: GameState, pr: { id: number; x: number; y: number; region: number }, opener: GameState['players'][number] | null, speedMul = 1) {
  const e = makeEnemy(s, 'mimic', pr.x, pr.y, pr.region, {
    hp: MIMIC_HP,
    mode: 'reveal',
    modeUntil: s.tick + secToTicks(MIMIC.revealSec),
    propId: pr.id,
    swallowed: 0,
    hurtUntil: s.tick + secToTicks(0.6),
    nextLeapTick: s.tick + secToTicks(MIMIC.revealSec + 1.5),
    speedMul,
  });
  s.enemies.push(e);
  s.events.push({ type: 'mimicAwoke', enemyId: e.id, x: pr.x, y: pr.y, byId: opener?.id ?? null });
  if (opener && s.tick >= opener.invulnUntil) {
    // The bite: it takes a shield; without one it's only a scare (the reveal is harmless).
    if (opener.shield > 0) {
      opener.shield--;
      opener.invulnUntil = s.tick + secToTicks(RULES.invulnSec);
      s.events.push({ type: 'shieldBroken', playerId: opener.id });
    }
    s.events.push({ type: 'mimicBite', playerId: opener.id, x: pr.x, y: pr.y });
  }
}

/** Whether the Mimic hurts on touch right now (not while revealing or in the air). */
export const harmless = (e: EnemyState) => e.kind === 'mimic' && (e.mode === 'reveal' || e.mode === 'leap');

function nearestPlayer(s: GameState, x: number, y: number) {
  let best: GameState['players'][number] | null = null;
  let bd = Infinity;
  for (const p of s.players) {
    if (!p.alive) continue;
    const d = Math.abs(p.x - x) + Math.abs(p.y - y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best ? { p: best, d: bd } : null;
}

/** Steps toward the current target cell; returns true when it is standing on a cell center. */
function stepTo(e: EnemyState, budget: number) {
  const dx = e.tx - e.x;
  const dy = e.ty - e.y;
  const d = Math.abs(dx) + Math.abs(dy);
  if (d > 0) {
    const mv = Math.min(d, budget);
    e.x += (dx / d) * mv;
    e.y += (dy / d) * mv;
  }
  if (Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y) < 1e-6) {
    e.x = e.tx;
    e.y = e.ty;
    return true;
  }
  return false;
}

/** Where to land next to the target: its cell, or the closest open one around it. */
function landingCell(s: GameState, e: EnemyState, x: number, y: number) {
  const cx = Math.round(x);
  const cy = Math.round(y);
  const opts = [{ x: cx, y: cy }, ...DIRS.map((d) => ({ x: cx + DIR_VEC[d].x, y: cy + DIR_VEC[d].y }))].filter(
    (c) => passable(s, c.x, c.y) && (c.x !== e.x || c.y !== e.y) && (s.adventure ? regionOf(s, c.x, c.y) === e.regionId : true),
  );
  return opts[0] ?? null;
}

function regionOf(s: GameState, x: number, y: number) {
  const adv = s.adventure!;
  const cx = Math.floor(x / adv.chunkW);
  const cy = Math.floor(y / adv.chunkH);
  return adv.regions.find((r) => r.cx === cx && r.cy === cy)?.id ?? -1;
}

/**
 * The Mimic hunts the closest player at a brisk trot. Every few seconds it crouches (the warning)
 * and leaps onto them over anything in the way. A bomb next to it gets swallowed — it chews for a
 * moment, then spits it back rolling toward the closest player on a short fuse.
 */
function updateMimic(s: GameState, e: EnemyState) {
  const mode = e.mode ?? 'hunt';
  const until = e.modeUntil ?? 0;
  if (mode === 'reveal' || mode === 'crouch') {
    if (s.tick < until) return;
    if (mode === 'reveal') {
      e.mode = 'hunt';
      return;
    }
    const l = e.leap!;
    e.mode = 'leap';
    l.t0 = s.tick;
    l.t1 = s.tick + secToTicks(MIMIC.leapSec);
    return;
  }
  if (mode === 'leap') {
    const l = e.leap!;
    const k = Math.min(1, (s.tick - l.t0) / Math.max(1, l.t1 - l.t0));
    e.x = l.fx + (l.tx - l.fx) * k;
    e.y = l.fy + (l.ty - l.fy) * k;
    if (k < 1) return;
    e.x = e.tx = l.tx;
    e.y = e.ty = l.ty;
    e.leap = undefined;
    e.mode = 'hunt';
    e.nextLeapTick = s.tick + secToTicks(MIMIC.leapEverySec);
    s.events.push({ type: 'mimicLand', enemyId: e.id, x: e.x, y: e.y });
    return;
  }
  if (mode === 'chew') {
    if (s.tick < until) return;
    spit(s, e);
    return;
  }
  // Hunting.
  let budget = MIMIC.speed * TICK_DT * (e.speedMul ?? 1);
  while (budget > 1e-6) {
    if (e.x === e.tx && e.y === e.ty) {
      if (centerDecision(s, e)) return;
      if (e.x === e.tx && e.y === e.ty) break;
    }
    if (!passable(s, e.tx, e.ty) && e.dir) {
      // A bomb rolled in front of it: gobble it from here.
      const b = bombAt(s, e.tx, e.ty);
      if (b && swallow(s, e, b.id)) return;
      const back = OPPOSITE[e.dir];
      const v = DIR_VEC[back];
      e.dir = back;
      e.tx = v.x < 0 ? Math.floor(e.x) : v.x > 0 ? Math.ceil(e.x) : e.x;
      e.ty = v.y < 0 ? Math.floor(e.y) : v.y > 0 ? Math.ceil(e.y) : e.y;
    }
    const before = Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y);
    stepTo(e, budget);
    budget -= before;
  }
}

/** At a cell center: swallow a bomb, start a leap, or pick the next step toward the prey. */
function centerDecision(s: GameState, e: EnemyState): boolean {
  for (const c of [{ x: e.x, y: e.y }, ...DIRS.map((d) => ({ x: e.x + DIR_VEC[d].x, y: e.y + DIR_VEC[d].y }))]) {
    const b = bombAt(s, c.x, c.y);
    if (b && swallow(s, e, b.id)) return true;
  }
  const near = nearestPlayer(s, e.x, e.y);
  if (!near) {
    e.dir = null;
    return false;
  }
  if (s.tick >= (e.nextLeapTick ?? 0) && near.d >= 2 && near.d <= MIMIC.leapRange) {
    const to = landingCell(s, e, near.p.x, near.p.y);
    if (to) {
      e.mode = 'crouch';
      e.modeUntil = s.tick + secToTicks(MIMIC.crouchSec);
      e.leap = { fx: e.x, fy: e.y, tx: to.x, ty: to.y, t0: 0, t1: 0 };
      const v = { x: to.x - e.x, y: to.y - e.y };
      e.dir = Math.abs(v.x) >= Math.abs(v.y) ? (v.x > 0 ? 'right' : 'left') : v.y > 0 ? 'down' : 'up';
      s.events.push({ type: 'mimicCrouch', enemyId: e.id, x: e.x, y: e.y, tx: to.x, ty: to.y });
      return true;
    }
  }
  const options = DIRS.filter((d) => passable(s, e.x + DIR_VEC[d].x, e.y + DIR_VEC[d].y));
  if (!options.length) {
    e.dir = null;
    return false;
  }
  const dist = (d: Dir) => Math.abs(near.p.x - (e.x + DIR_VEC[d].x)) + Math.abs(near.p.y - (e.y + DIR_VEC[d].y));
  const closer = options.filter((d) => dist(d) < near.d - 0.5);
  // Mostly a straight hunt; now and then a random turn so it can't be kited forever on a pillar.
  const pool = closer.length && nextRandom(s) < 0.8 ? closer : options.filter((d) => !e.dir || d !== OPPOSITE[e.dir!]).length ? options.filter((d) => !e.dir || d !== OPPOSITE[e.dir!]) : options;
  e.dir = pool[randInt(s, pool.length)];
  e.tx = e.x + DIR_VEC[e.dir].x;
  e.ty = e.y + DIR_VEC[e.dir].y;
  return false;
}

function swallow(s: GameState, e: EnemyState, bombId: number): boolean {
  const i = s.bombs.findIndex((b) => b.id === bombId);
  if (i < 0) return false;
  const b = s.bombs[i];
  if (b.flightUntil > s.tick || b.ownerId === 'mimic') return false;
  s.bombs.splice(i, 1);
  e.swallowed = (e.swallowed ?? 0) + 1;
  e.mode = 'chew';
  e.modeUntil = s.tick + secToTicks(MIMIC.chewSec);
  // Settle on a cell center while chewing.
  e.x = e.tx = Math.round(e.x);
  e.y = e.ty = Math.round(e.y);
  s.events.push({ type: 'mimicSwallow', enemyId: e.id, x: b.x, y: b.y });
  return true;
}

/** Spits one swallowed bomb rolling toward the closest player (more in the mouth: chew again). */
function spit(s: GameState, e: EnemyState) {
  const near = nearestPlayer(s, e.x, e.y);
  e.swallowed = Math.max(0, (e.swallowed ?? 1) - 1);
  e.mode = e.swallowed > 0 ? 'chew' : 'hunt';
  e.modeUntil = s.tick + secToTicks(0.5);
  let dir: Dir = e.dir ?? 'down';
  if (near) {
    const vx = near.p.x - e.x;
    const vy = near.p.y - e.y;
    dir = Math.abs(vx) >= Math.abs(vy) ? (vx >= 0 ? 'right' : 'left') : vy >= 0 ? 'down' : 'up';
  }
  const tries: Dir[] = [dir, ...DIRS.filter((d) => d !== dir && d !== OPPOSITE[dir]), OPPOSITE[dir]];
  for (const d of tries) {
    const x = e.x + DIR_VEC[d].x;
    const y = e.y + DIR_VEC[d].y;
    if (!passable(s, x, y) || s.players.some((p) => p.alive && Math.round(p.x) === x && Math.round(p.y) === y)) continue;
    const b = spawnBomb(s, { ownerId: 'mimic', x, y, range: MIMIC.spitRange, silent: true });
    b.detonateTick = s.tick + secToTicks(MIMIC.spitFuseSec);
    b.slideDir = d;
    b.nextSlideTick = s.tick + kickIntervalTicks();
    e.dir = d;
    s.events.push({ type: 'mimicSpit', enemyId: e.id, x, y });
    return;
  }
  // Boxed in: it just digests it.
}

// ───────────────────────────── B5: the corrupted boss's motes ─────────────────────────────

export const MOTE_SPEED = 1.5;

/** A violet mote drifts cell by cell toward the closest player (a little random, never through bombs). */
function updateMote(s: GameState, e: EnemyState) {
  let budget = MOTE_SPEED * TICK_DT * (e.speedMul ?? 1);
  while (budget > 1e-6) {
    if (e.x === e.tx && e.y === e.ty) {
      const near = nearestPlayer(s, e.x, e.y);
      const options = DIRS.filter((d) => passable(s, e.x + DIR_VEC[d].x, e.y + DIR_VEC[d].y));
      if (!options.length || !near) break;
      const dist = (d: Dir) => Math.abs(near.p.x - (e.x + DIR_VEC[d].x)) + Math.abs(near.p.y - (e.y + DIR_VEC[d].y));
      const closer = options.filter((d) => dist(d) < near.d - 0.5);
      const pool = closer.length && nextRandom(s) < 0.75 ? closer : options;
      e.dir = pool[randInt(s, pool.length)];
      e.tx = e.x + DIR_VEC[e.dir].x;
      e.ty = e.y + DIR_VEC[e.dir].y;
    }
    if (!passable(s, e.tx, e.ty) && e.dir && !(Number.isInteger(e.x) && Number.isInteger(e.y))) {
      const back = OPPOSITE[e.dir];
      const v = DIR_VEC[back];
      e.dir = back;
      e.tx = v.x < 0 ? Math.floor(e.x) : v.x > 0 ? Math.ceil(e.x) : e.x;
      e.ty = v.y < 0 ? Math.floor(e.y) : v.y > 0 ? Math.ceil(e.y) : e.y;
    } else if (!passable(s, e.tx, e.ty)) {
      e.tx = e.x;
      e.ty = e.y;
      break;
    }
    const before = Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y);
    stepTo(e, budget);
    budget -= before;
  }
}
