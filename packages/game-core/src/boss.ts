import { BOSSES, BOSS_ARENA, Cell, DIRS, DIR_VEC, RULES, TICK_DT, secToTicks, type BossDef, type BossId, type Dir } from '@4walls/shared';
import { destroyBlock } from './bombs';
import { hitPlayer } from './combat';
import { cellIndex, createGrid, getCell, inBounds, setCell } from './grid';
import { nextRandom, pickWeighted, randInt } from './rng';
import type { BossAttack, BossState, Flame, GameState, Grid, PlayerState } from './types';
import { cellOf, isPit, newId } from './world';

/** Bosses cover the 3×3 cells around their center; players touching that body die. */
const BODY_HALF = 1;
const CONTACT = 1.42;

// ───────────────────────────── arena ─────────────────────────────

/**
 * Boss arena: open floor so the big body can roam, four pillars for cover and a few
 * destructible blocks for power-ups. The boss starts in the middle, players in the corners.
 */
export function buildBossArena(rngHolder: { rng: number }): { grid: Grid; spawns: { x: number; y: number }[]; center: { x: number; y: number } } {
  const { width: w, height: h, blockFill } = BOSS_ARENA;
  const g = createGrid(w, h);
  const center = { x: Math.floor(w / 2), y: Math.floor(h / 2) };
  const spawns = [
    { x: 1, y: 1 },
    { x: w - 2, y: h - 2 },
    { x: w - 2, y: 1 },
    { x: 1, y: h - 2 },
  ];
  const pillars = [
    [4, 4],
    [w - 5, 4],
    [4, h - 5],
    [w - 5, h - 5],
  ];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || pillars.some(([px, py]) => px === x && py === y)) {
        setCell(g, x, y, Cell.Wall);
        continue;
      }
      const nearBoss = Math.max(Math.abs(x - center.x), Math.abs(y - center.y)) <= 2;
      const nearSpawn = spawns.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) <= 2);
      if (!nearBoss && !nearSpawn && nextRandom(rngHolder) < blockFill) setCell(g, x, y, Cell.Block);
    }
  return { grid: g, spawns, center };
}

// ───────────────────────────── lifecycle ─────────────────────────────

/** Where and how strong a boss enters (the Adventure's Guardian Chambers); Boss Rush uses the defaults. */
export interface BossSpawn {
  x: number;
  y: number;
  regionId: number;
  level: number;
  hp: number;
  speedMul: number;
}

export function spawnBoss(s: GameState, kind: BossId, at?: BossSpawn) {
  const def = BOSSES[kind];
  const { w, h } = s.grid;
  const x = at?.x ?? Math.floor(w / 2);
  const y = at?.y ?? Math.floor(h / 2);
  crushFootprint(s, x, y);
  const hp = at?.hp ?? def.hp;
  s.boss = {
    kind,
    x, y, px: x, py: y, tx: x, ty: y,
    facing: 'down',
    hp,
    maxHp: hp,
    enraged: false,
    action: 'walk',
    actionStart: s.tick,
    actionUntil: s.tick,
    attack: null,
    chargeDir: null,
    targets: [],
    // First attack a little after the fight starts (the countdown counts as waiting time).
    nextAttackTick: Math.max(s.tick, s.countdownTicks) + secToTicks(2.5),
    invulnUntil: 0,
    frozenUntil: 0,
    lastHitTick: -999,
    diedTick: -1,
    phase: 0,
    ...(at ? { regionId: at.regionId, level: at.level, speedMul: at.speedMul } : {}),
  };
  const total = s.bossesDefeated + s.bossQueue.length + 1;
  s.events.push({ type: 'bossSpawned', boss: kind, index: s.bossesDefeated, total });
}

/** Called every playing tick. */
export function updateBoss(s: GameState) {
  const b = s.boss;
  if (!b) {
    if (s.nextBossTick >= 0 && s.tick >= s.nextBossTick && s.bossQueue.length) {
      s.nextBossTick = -1;
      spawnBoss(s, s.bossQueue.shift()!);
    }
    return;
  }
  b.px = b.x;
  b.py = b.y;
  const def = BOSSES[b.kind];
  if (b.action === 'dead') {
    // The body crumbles for a moment, then the next boss (if any) is on its way.
    if (s.tick - b.diedTick >= secToTicks(2.2)) {
      s.boss = null;
      if (s.bossQueue.length && b.regionId === undefined) s.nextBossTick = s.tick + secToTicks(2.5);
    }
    return;
  }
  if (takeDamage(s, b, def)) return; // just died
  if (s.tick < b.frozenUntil) return; // frozen solid: harmless and still
  if (b.action !== 'burrowed') touchPlayers(s, b);

  switch (b.action) {
    case 'walk':
      walk(s, b, def);
      if (atCell(b) && s.tick >= b.nextAttackTick) chooseAttack(s, b, def);
      break;
    case 'windup':
      if (s.tick >= b.actionUntil) performAttack(s, b, def);
      break;
    case 'charge':
      chargeStep(s, b, def);
      break;
    case 'recover':
    case 'stunned':
      if (s.tick >= b.actionUntil) setAction(s, b, 'walk', 0);
      break;
    case 'burrowed':
      if (s.tick >= b.actionUntil) emerge(s, b, def);
      break;
  }
}

// ───────────────────────────── helpers ─────────────────────────────

const atCell = (b: BossState) => b.x === b.tx && b.y === b.ty;

function setAction(s: GameState, b: BossState, action: BossState['action'], sec: number) {
  b.action = action;
  b.actionStart = s.tick;
  b.actionUntil = s.tick + secToTicks(sec);
}

/** Cell inside the boss's arena: anywhere in Boss Rush, its own Guardian Chamber in the Adventure. */
export function inArena(s: GameState, b: { regionId?: number }, x: number, y: number) {
  if (b.regionId === undefined || !s.adventure) return true;
  return inBounds(s.grid, x, y) && s.adventure.regionOf[cellIndex(s.grid, x, y)] === b.regionId;
}

/** The whole 3×3 body fits (walls, pillars, pits and the chamber's edge block; blocks get crushed). */
function footprintClear(s: GameState, b: { regionId?: number }, cx: number, cy: number) {
  for (let dy = -BODY_HALF; dy <= BODY_HALF; dy++)
    for (let dx = -BODY_HALF; dx <= BODY_HALF; dx++) {
      const c = getCell(s.grid, cx + dx, cy + dy);
      if (c === Cell.Wall || isPit(c) || !inArena(s, b, cx + dx, cy + dy)) return false;
    }
  return true;
}

function crushFootprint(s: GameState, cx: number, cy: number) {
  for (let dy = -BODY_HALF; dy <= BODY_HALF; dy++)
    for (let dx = -BODY_HALF; dx <= BODY_HALF; dx++) if (getCell(s.grid, cx + dx, cy + dy) === Cell.Block) destroyBlock(s, cx + dx, cy + dy, 'boss');
}

function nearestPlayer(s: GameState, b: BossState): PlayerState | null {
  let best: PlayerState | null = null;
  let bd = Infinity;
  for (const p of s.players) {
    if (!p.alive) continue;
    const d = Math.abs(p.x - b.x) + Math.abs(p.y - b.y);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** Moves toward (tx, ty) by up to `budget` cells; returns the unused budget. */
function moveToward(b: BossState, budget: number) {
  const dx = b.tx - b.x;
  const dy = b.ty - b.y;
  const d = Math.abs(dx) + Math.abs(dy);
  const mv = Math.min(d, budget);
  if (d > 0) {
    b.x += (dx / d) * mv;
    b.y += (dy / d) * mv;
  }
  if (Math.abs(b.tx - b.x) + Math.abs(b.ty - b.y) < 1e-6) {
    b.x = b.tx;
    b.y = b.ty;
  }
  return budget - mv;
}

function touchPlayers(s: GameState, b: BossState) {
  for (const p of s.players) if (p.alive && Math.abs(p.x - b.x) < CONTACT && Math.abs(p.y - b.y) < CONTACT) hitPlayer(s, p, null);
}

/**
 * Player blasts hurt the boss once per cooldown; ice freezes it instead. Its own fire doesn't.
 * Returns true when this hit killed it.
 */
function takeDamage(s: GameState, b: BossState, def: BossDef): boolean {
  if (s.tick < b.invulnUntil) return false;
  const cx = cellOf(b.x);
  const cy = cellOf(b.y);
  for (const f of s.flames) {
    // Only the players' fire counts (not its own, meteors, geysers or burning grass).
    if (f.untilTick <= s.tick || f.ownerId === 'boss' || f.ownerId === 'meteor' || f.ownerId === '') continue;
    if (Math.abs(f.x - cx) > BODY_HALF || Math.abs(f.y - cy) > BODY_HALF) continue;
    if (f.kind === 'ice') {
      if (s.tick >= b.frozenUntil) b.frozenUntil = s.tick + secToTicks(def.freezeSec);
      continue;
    }
    // Armored bosses only open up during some actions; otherwise the blast clanks off.
    if (def.exposedDuring && !(def.exposedDuring as string[]).includes(b.action)) {
      b.invulnUntil = s.tick + secToTicks(def.hitCooldownSec);
      s.events.push({ type: 'bossBlocked', x: b.x, y: b.y });
      return false;
    }
    b.hp = Math.max(0, b.hp - 1);
    b.invulnUntil = s.tick + secToTicks(def.hitCooldownSec);
    b.lastHitTick = s.tick;
    s.events.push({ type: 'bossHit', hp: b.hp, maxHp: b.maxHp, byId: f.ownerId, x: b.x, y: b.y });
    enterPhase(s, b, def);
    if (b.hp <= 0) {
      setAction(s, b, 'dead', 0);
      b.diedTick = s.tick;
      b.attack = null;
      s.bossesDefeated++;
      s.meteors = [];
      b.targets = [];
      for (const e of s.enemies) {
        if (e.alive && e.kind === 'sprout') {
          e.alive = false;
          e.diedTick = s.tick;
          s.events.push({ type: 'enemyDied', enemyId: e.id, byId: 'boss', x: e.x, y: e.y });
        }
      }
      const owner = s.players.find((p) => p.id === f.ownerId);
      if (owner) owner.kills++;
      s.events.push({ type: 'bossDefeated', boss: b.kind, x: b.x, y: b.y });
      // Adventure: the chamber's objective is this boss.
      const reg = b.regionId === undefined ? undefined : s.adventure?.regions.find((r) => r.id === b.regionId);
      if (reg && reg.objective.kind === 'boss') reg.objective.progress = reg.objective.goal;
      return true;
    }
    return false;
  }
  return false;
}

/** Thresholds of this encounter: deeper Adventure bosses get an extra, faster phase. */
const phasesOf = (b: BossState, def: BossDef) => ((b.level ?? 0) > 0 && def.deepPhases ? def.deepPhases : def.phases);

/**
 * Crossing a health threshold starts the next phase. Phase 1 is the enraged one (faster, wider
 * attacks); later phases cut the pause between attacks. In the Adventure a phase change gives a
 * short breather (the boss roars, untouchable) and recharges the chamber's totems.
 */
function enterPhase(s: GameState, b: BossState, def: BossDef) {
  if (b.hp <= 0) return;
  const want = phasesOf(b, def).filter((t) => b.hp <= b.maxHp * t).length;
  const now = b.phase ?? 0;
  if (want <= now) return;
  b.phase = want;
  if (!b.enraged && want >= 1) {
    b.enraged = true;
    s.events.push({ type: 'bossEnraged' });
  }
  if (b.regionId === undefined) return;
  s.events.push({ type: 'bossPhase', phase: want });
  b.invulnUntil = Math.max(b.invulnUntil, s.tick + secToTicks(1));
  for (const p of s.adventure?.props ?? []) if (p.kind === 'totem' && p.region === b.regionId && p.state === 'used') p.state = 'idle';
}

function walk(s: GameState, b: BossState, def: BossDef) {
  let budget = (b.enraged ? def.enragedSpeed : def.speed) * (b.speedMul ?? 1) * TICK_DT;
  while (budget > 1e-6) {
    if (atCell(b)) {
      if (s.tick >= b.nextAttackTick) return; // stop on the cell to attack
      const target = nearestPlayer(s, b);
      if (!target) return;
      // Already in reach: plant feet and wait for the next attack.
      if (Math.max(Math.abs(target.x - b.x), Math.abs(target.y - b.y)) < 1.6) return;
      let best: Dir | null = null;
      let bestD = Infinity;
      for (const d of DIRS) {
        const nx = b.x + DIR_VEC[d].x;
        const ny = b.y + DIR_VEC[d].y;
        if (!footprintClear(s, b, nx, ny)) continue;
        const dist = Math.abs(target.x - nx) + Math.abs(target.y - ny) + nextRandom(s) * 0.3;
        if (dist < bestD) {
          bestD = dist;
          best = d;
        }
      }
      if (!best) return;
      b.facing = best;
      b.tx = b.x + DIR_VEC[best].x;
      b.ty = b.y + DIR_VEC[best].y;
      crushFootprint(s, b.tx, b.ty);
    }
    budget = moveToward(b, budget);
  }
}

function chooseAttack(s: GameState, b: BossState, def: BossDef) {
  const target = nearestPlayer(s, b);
  if (!target) return;
  const dx = target.x - b.x;
  const dy = target.y - b.y;
  const reach = Math.max(Math.abs(dx), Math.abs(dy));
  const aligned = Math.abs(dx) <= 1.2 || Math.abs(dy) <= 1.2;
  const has = (a: BossAttack) => def.attacks.includes(a);
  const options: { a: BossAttack; w: number }[] = [];
  if (has('meteors')) options.push({ a: 'meteors', w: 2 });
  if (has('slam') && reach <= 3.5) options.push({ a: 'slam', w: 4 });
  if (has('charge') && aligned && reach > 2) options.push({ a: 'charge', w: b.enraged ? 4 : 2 });
  if (has('roots')) options.push({ a: 'roots', w: 3 });
  if (has('spores') && s.enemies.filter((e) => e.alive && e.kind === 'sprout').length < (def.maxSprouts ?? 6)) options.push({ a: 'spores', w: 2 });
  if (has('burrow')) options.push({ a: 'burrow', w: reach > 5 ? 4 : 2 });
  if (!options.length) return;
  let attack = pickWeighted(s, options, (o) => o.w).a;
  b.facing = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
  b.targets = [];
  if (attack === 'charge') b.chargeDir = b.facing;
  if (attack === 'roots') b.targets = rootTargets(s, b, target);
  if (attack === 'burrow') {
    const spot = emergeSpot(s, b, target);
    if (spot) b.targets = [spot];
    else attack = 'roots';
    if (attack === 'roots') b.targets = rootTargets(s, b, target);
  }
  b.attack = attack;
  const speedUp = b.enraged ? 0.8 : 1;
  const windup =
    attack === 'slam' ? def.slamWindupSec
    : attack === 'meteors' ? def.meteorWindupSec
    : attack === 'charge' ? def.chargeWindupSec
    : attack === 'roots' ? (def.rootsWindupSec ?? 1)
    : attack === 'spores' ? (def.sporesWindupSec ?? 0.7)
    : (def.burrowWindupSec ?? 0.6);
  setAction(s, b, 'windup', windup * speedUp);
  s.events.push({ type: 'bossWindup', attack });
}

/**
 * Root lines: the whole row and column through the target player (stopping at walls), plus —
 * once enraged — the row and column through the boss itself. Never inside the boss's body.
 */
export function rootLines(s: GameState, b: { x: number; y: number; enraged: boolean; regionId?: number }, target: { x: number; y: number }) {
  const seen = new Set<number>();
  const out: { x: number; y: number }[] = [];
  const bx = cellOf(b.x);
  const by = cellOf(b.y);
  const add = (x: number, y: number) => {
    if (Math.abs(x - bx) <= BODY_HALF && Math.abs(y - by) <= BODY_HALF) return;
    if (!inArena(s, b, x, y)) return;
    const k = y * s.grid.w + x;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ x, y });
  };
  const cross = (cx: number, cy: number) => {
    for (const [vx, vy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let i = vx === 0 && vy === 0 ? 0 : 0; ; i++) {
        const x = cx + vx * i;
        const y = cy + vy * i;
        if (getCell(s.grid, x, y) === Cell.Wall) break;
        add(x, y);
      }
    }
  };
  cross(cellOf(target.x), cellOf(target.y));
  if (b.enraged) cross(bx, by);
  return out;
}

/**
 * Root lines of one attack. In the Adventure a big group (3+) gets a second cross through the
 * player farthest from the first target, so spreading out never makes the fight trivial.
 */
function rootTargets(s: GameState, b: BossState, target: PlayerState) {
  const cells = rootLines(s, b, target);
  const alive = s.players.filter((p) => p.alive);
  if (b.regionId === undefined || alive.length < 3) return cells;
  const far = alive.reduce((best, p) => (Math.abs(p.x - target.x) + Math.abs(p.y - target.y) > Math.abs(best.x - target.x) + Math.abs(best.y - target.y) ? p : best), target);
  const seen = new Set(cells.map((c) => c.y * s.grid.w + c.x));
  for (const c of rootLines(s, { ...b, enraged: false }, far)) if (!seen.has(c.y * s.grid.w + c.x)) cells.push(c);
  return cells;
}

/** Where the Guardião bursts out: a free 3×3 spot 2–4 cells from the player (never on top of anyone). */
function emergeSpot(s: GameState, b: BossState, target: PlayerState) {
  const tx = cellOf(target.x);
  const ty = cellOf(target.y);
  const spots: { x: number; y: number }[] = [];
  for (let y = ty - 4; y <= ty + 4; y++)
    for (let x = tx - 4; x <= tx + 4; x++) {
      const d = Math.max(Math.abs(x - tx), Math.abs(y - ty));
      if (d < 2 || !footprintClear(s, b, x, y)) continue;
      if (s.players.some((p) => p.alive && Math.abs(p.x - x) < 1.6 && Math.abs(p.y - y) < 1.6)) continue;
      spots.push({ x, y });
    }
  return spots.length ? spots[randInt(s, spots.length)] : null;
}

/** Sprouts pop out of the ground around the boss (free floor only, away from players). */
function summonSprouts(s: GameState, b: BossState, count: number, max: number) {
  const alive = s.enemies.filter((e) => e.alive && e.kind === 'sprout').length;
  const n = Math.min(count, Math.max(0, max - alive));
  const bx = cellOf(b.x);
  const by = cellOf(b.y);
  const free: { x: number; y: number }[] = [];
  for (let y = by - 3; y <= by + 3; y++)
    for (let x = bx - 3; x <= bx + 3; x++) {
      if (Math.max(Math.abs(x - bx), Math.abs(y - by)) < 2) continue;
      if (getCell(s.grid, x, y) !== Cell.Floor || !inArena(s, b, x, y) || s.bombs.some((bb) => bb.x === x && bb.y === y)) continue;
      if (s.players.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 2)) continue;
      if (s.enemies.some((e) => e.alive && Math.round(e.x) === x && Math.round(e.y) === y)) continue;
      free.push({ x, y });
    }
  for (let i = 0; i < n && free.length; i++) {
    const [c] = free.splice(randInt(s, free.length), 1);
    s.enemies.push({ id: newId(s), kind: 'sprout', x: c.x, y: c.y, px: c.x, py: c.y, dir: null, tx: c.x, ty: c.y, alive: true, diedTick: -1, frozenUntil: 0, regionId: b.regionId ?? -1 });
  }
}

/** Bursting out of the ground: roots erupt in a ring, then a vulnerable recovery. */
function emerge(s: GameState, b: BossState, def: BossDef) {
  const spot = b.targets[0];
  if (spot) {
    b.x = b.px = b.tx = spot.x;
    b.y = b.py = b.ty = spot.y;
    crushFootprint(s, spot.x, spot.y);
  }
  b.targets = [];
  b.invulnUntil = s.tick;
  fireCells(s, b, slamCells(s, b, 2), 'root');
  s.events.push({ type: 'bossEmerge', x: b.x, y: b.y });
  touchPlayers(s, b);
  setAction(s, b, 'recover', def.recoverSec);
}

/** Cells hit by a slam: a ring around the body (wider once enraged). */
export function slamCells(s: GameState, b: { x: number; y: number; enraged: boolean; regionId?: number }, maxRing?: number) {
  const cx = cellOf(b.x);
  const cy = cellOf(b.y);
  const outer = maxRing ?? (b.enraged ? 4 : 3);
  const cells: { x: number; y: number }[] = [];
  for (let y = cy - outer; y <= cy + outer; y++)
    for (let x = cx - outer; x <= cx + outer; x++) {
      const ring = Math.max(Math.abs(x - cx), Math.abs(y - cy));
      if (ring < 2 || getCell(s.grid, x, y) === Cell.Wall || !inArena(s, b, x, y)) continue;
      cells.push({ x, y });
    }
  return cells;
}

function fireCells(s: GameState, b: BossState, cells: { x: number; y: number }[], style?: 'root') {
  const until = s.tick + secToTicks(RULES.flameSec + (style ? 0.35 : 0.15));
  for (const c of cells) {
    if (getCell(s.grid, c.x, c.y) === Cell.Block) destroyBlock(s, c.x, c.y, 'boss');
    const f: Flame = { x: c.x, y: c.y, part: 'center', dir: null, bombId: -1, ownerId: 'boss', bornTick: s.tick, untilTick: until, kind: 'normal', ...(style ? { style } : {}) };
    s.flames.push(f);
  }
  if (style === 'root') s.events.push({ type: 'bossRoots', cells });
  else s.events.push({ type: 'explosion', bombId: -1, x: cellOf(b.x), y: cellOf(b.y), ownerId: 'boss', kind: 'normal', cells });
}

function performAttack(s: GameState, b: BossState, def: BossDef) {
  const attack = b.attack;
  // Phase 2 and beyond (deep encounters) attack more often.
  const cooldown = secToTicks((b.enraged ? def.enragedAttackEverySec : def.attackEverySec) * ((b.phase ?? 0) >= 2 ? 0.8 : 1));
  if (attack === 'slam') {
    fireCells(s, b, slamCells(s, b));
    s.events.push({ type: 'bossSlam', x: b.x, y: b.y });
    setAction(s, b, 'recover', def.recoverSec);
  } else if (attack === 'meteors') {
    callMeteors(s, b.enraged ? def.enragedMeteors : def.meteors);
    s.events.push({ type: 'bossRoar', x: b.x, y: b.y });
    setAction(s, b, 'recover', def.recoverSec * 0.5);
  } else if (attack === 'charge' && b.chargeDir) {
    setAction(s, b, 'charge', 0);
    s.events.push({ type: 'bossCharge', dir: b.chargeDir });
  } else if (attack === 'roots') {
    fireCells(s, b, b.targets, 'root');
    b.targets = [];
    setAction(s, b, 'recover', def.recoverSec * 0.6);
  } else if (attack === 'spores') {
    summonSprouts(s, b, (b.enraged ? def.enragedSprouts : def.sprouts) ?? 3, def.maxSprouts ?? 6);
    s.events.push({ type: 'bossSpores', x: b.x, y: b.y });
    setAction(s, b, 'recover', def.recoverSec * 0.5);
  } else if (attack === 'burrow' && b.targets.length) {
    // Underground: untouchable and harmless until it bursts out at the marked spot.
    setAction(s, b, 'burrowed', def.burrowSec ?? 1.2);
    b.invulnUntil = b.actionUntil;
    s.events.push({ type: 'bossBurrow', x: b.x, y: b.y });
  } else {
    setAction(s, b, 'walk', 0);
  }
  b.nextAttackTick = s.tick + cooldown;
}

/** Lava rain: meteors land on and around the players (they get the usual warning markers). */
function callMeteors(s: GameState, count: number) {
  const alive = s.players.filter((p) => p.alive);
  if (!alive.length) return;
  const taken = new Set(s.meteors.map((m) => m.y * s.grid.w + m.x));
  for (let i = 0; i < count; i++) {
    const p = alive[i % alive.length];
    for (let tries = 0; tries < 12; tries++) {
      const x = cellOf(p.x) + (i < alive.length ? 0 : randInt(s, 5) - 2);
      const y = cellOf(p.y) + (i < alive.length ? 0 : randInt(s, 5) - 2);
      const key = y * s.grid.w + x;
      if (getCell(s.grid, x, y) === Cell.Wall || taken.has(key)) continue;
      taken.add(key);
      s.meteors.push({ id: newId(s), x, y, spawnTick: s.tick, impactTick: s.tick + secToTicks(1.4 + i * 0.12) });
      break;
    }
  }
}

/** Charge: runs straight until the body hits a wall, then slams and is stunned (open to attack). */
function chargeStep(s: GameState, b: BossState, def: BossDef) {
  const dir = b.chargeDir!;
  let budget = def.chargeSpeed * TICK_DT;
  while (budget > 1e-6) {
    if (atCell(b)) {
      const nx = b.x + DIR_VEC[dir].x;
      const ny = b.y + DIR_VEC[dir].y;
      if (!footprintClear(s, b, nx, ny)) {
        fireCells(s, b, slamCells(s, b, 2));
        s.events.push({ type: 'bossSlam', x: b.x, y: b.y });
        b.chargeDir = null;
        setAction(s, b, 'stunned', def.recoverSec * 1.5);
        return;
      }
      b.tx = nx;
      b.ty = ny;
      crushFootprint(s, nx, ny);
    }
    budget = moveToward(b, budget);
    touchPlayers(s, b);
  }
}
