import { ARENAS, BOSS_ARENA, BOSS_RUSH, CHARACTERS, RULES, STARTER_CHARACTERS, secToTicks, type CharacterId, type GameConfig } from '@4walls/shared';
import { updateMines, useAbility } from './abilities';
import { createAdventure, revealAround, spawnAdventureEnemies, tryBankCoins, tryEndExpedition, updateAdventure } from './adventure';
import { applySnap, newExpedition, snapPlayer } from './expedition';
import { tryCampAction } from './camp';
import { scheduleFirstEvent, updateArenaEvents } from './arenaEvents';
import { buildBossArena, spawnBoss, updateBoss } from './boss';
import { tryPlaceBomb, updateBombs } from './bombs';
import { applyDamage, collectPowerups } from './combat';
import { spawnEnemies, updateEnemies } from './enemies';
import { generateArena, spawnPoints } from './grid';
import { MODES, VERSUS_PRACTICE_ENEMIES } from './modes';
import { stepPlayerMovement } from './movement';
import type { GameState, InputMap, PlayerState } from './types';

export function createGame(config: GameConfig): GameState {
  const arena = config.arenaId ? ARENAS[config.arenaId] : undefined;
  // Adventure builds its own (non-rectangular) world; arenas come from the arena definition.
  const rngHolder = { rng: config.seed | 0 };
  const adv = config.mode === 'adventure' ? createAdventure(config.seed | 0, config.expedition?.camp ?? 0) : null;
  const bossArena = config.mode === 'bossrush' ? buildBossArena(rngHolder) : null;
  const custom = adv ?? bossArena;
  const width = custom ? custom.grid.w : (arena?.width ?? config.width);
  const height = custom ? custom.grid.h : (arena?.height ?? config.height);
  const cfg: GameConfig = { ...config, width, height, ...(custom ? { events: false } : {}) };
  const s: GameState = {
    config: cfg,
    mode: cfg.mode,
    tick: 0,
    phase: 'countdown',
    phaseStartTick: 0,
    countdownTicks: secToTicks(RULES.countdownSec),
    timeLeftTicks: secToTicks(RULES.roundSec),
    grid: null as never,
    players: [],
    bombs: [],
    flames: [],
    powerups: [],
    enemies: [],
    mines: [],
    meteors: [],
    event: null,
    adventure: adv?.adventure ?? null,
    boss: null,
    bossQueue: bossArena ? [...(config.bosses ?? BOSS_RUSH)] : [],
    bossesDefeated: 0,
    nextBossTick: -1,
    nextEventTick: -1,
    rng: rngHolder.rng,
    nextId: 1,
    result: null,
    events: [],
  };
  s.grid = custom ? custom.grid : generateArena(width, height, s);
  const spawns = custom ? custom.spawns : spawnPoints(width, height);
  if (adv) s.timeLeftTicks = secToTicks(99 * 60); // adventure has no round timer
  if (bossArena) s.timeLeftTicks = secToTicks(BOSS_ARENA.roundSec);
  s.players = cfg.players.map((pc) => {
    const ch = CHARACTERS[pc.characterId as CharacterId] ?? CHARACTERS.bombito;
    const sp = spawns[pc.slot % spawns.length];
    const p: PlayerState = {
      id: pc.id,
      slot: pc.slot,
      name: pc.name,
      characterId: ch.id,
      colorIndex: pc.colorIndex ?? pc.slot,
      x: sp.x,
      y: sp.y,
      px: sp.x,
      py: sp.y,
      facing: 'down',
      moving: false,
      alive: true,
      speed: RULES.baseSpeed + ch.speedBonus,
      maxBombs: RULES.baseBombs + ch.bombBonus,
      range: RULES.baseRange + ch.rangeBonus,
      speedLevel: 0,
      shield: 0,
      invulnUntil: 0,
      passBombs: [],
      diedTick: -1,
      kills: 0,
      blocksDestroyed: 0,
      abilityReadyTick: 0,
      frozenUntil: 0,
      ghostUntil: 0,
      canKick: !!ch.startsWithKick,
      hasBoots: false,
      hasRemote: false,
      special: null,
      slideDir: null,
      canThrow: false,
      maneuver: null,
      maneuverReadyTick: 0,
      turboUntil: 0,
    };
    return p;
  });
  if (adv) {
    // Task 3: a new expedition, or one resumed at its last campfire (heroes as they were there).
    const save = cfg.expedition;
    s.expedition = save ? { ...save, snapshot: save.snapshot.map((q) => ({ ...q })) } : newExpedition();
    for (const p of s.players) applySnap(p, s.expedition.snapshot.find((q) => q.slot === p.slot));
    if (!save) s.expedition.snapshot = s.players.map(snapPlayer);
    // A3: the group's rescued heroes live at the camps (plus those met on this expedition).
    s.expedition.residents = [...new Set([...(s.expedition.residents ?? []), ...(cfg.residents ?? [])])].filter((id) => !(STARTER_CHARACTERS as string[]).includes(id));
    spawnAdventureEnemies(s);
    revealAround(s);
  } else if (bossArena) {
    // Heroes start a little stronger: bosses don't wait for you to farm power-ups.
    for (const p of s.players) {
      p.maxBombs += 1;
      p.range += 1;
    }
    if (s.bossQueue.length) spawnBoss(s, s.bossQueue.shift()!);
  } else {
    // Versus alone: practice against a few Magmitos instead of an instant "last one standing" win.
    const soloVersus = cfg.mode === 'versus' && cfg.players.length === 1;
    const enemyCount = cfg.enemyCount ?? (soloVersus ? VERSUS_PRACTICE_ENEMIES : MODES[cfg.mode].defaultEnemies);
    if (enemyCount > 0) spawnEnemies(s, enemyCount);
  }
  scheduleFirstEvent(s);
  return s;
}

/** Advances the simulation by exactly one fixed tick. Pure game logic: no rendering, no I/O. */
export function step(s: GameState, inputs: InputMap): void {
  s.events = [];
  s.tick++;
  for (const p of s.players) {
    p.px = p.x;
    p.py = p.y;
  }
  for (const e of s.enemies) {
    e.px = e.x;
    e.py = e.y;
  }

  if (s.phase === 'countdown') {
    const elapsed = s.tick - s.phaseStartTick;
    const remaining = s.countdownTicks - elapsed;
    if (remaining > 0 && remaining % 60 === 0) s.events.push({ type: 'countdown', value: remaining / 60 });
    if (elapsed === 1) s.events.push({ type: 'countdown', value: Math.ceil(s.countdownTicks / 60) });
    if (remaining <= 0) {
      s.phase = 'playing';
      s.phaseStartTick = s.tick;
      s.events.push({ type: 'go' });
    }
    return;
  }
  if (s.phase === 'ended') {
    // Let lingering flames die out visually; nothing else changes.
    s.flames = s.flames.filter((f) => f.untilTick > s.tick);
    return;
  }

  // 1. Players: movement, then bomb and ability buttons.
  for (const p of s.players) {
    if (!p.alive) continue;
    const input = inputs[p.id];
    stepPlayerMovement(s, p, input);
    if (s.tick < p.frozenUntil) continue;
    if (input?.campBank) tryBankCoins(s, p);
    if (input?.campAction) tryCampAction(s, p, input.campAction);
    if (input?.campEnd) tryEndExpedition(s, p);
    if (input?.bomb) tryPlaceBomb(s, p);
    if (input?.ability) useAbility(s, p);
  }

  // 2. World.
  updateEnemies(s);
  updateBoss(s);
  updateArenaEvents(s);
  updateBombs(s);
  updateMines(s);
  applyDamage(s);
  collectPowerups(s);
  updateAdventure(s);

  // 3. Rules.
  s.timeLeftTicks = Math.max(0, s.timeLeftTicks - 1);
  const result = MODES[s.mode].checkEnd(s);
  if (result) {
    s.result = result;
    s.phase = 'ended';
    s.phaseStartTick = s.tick;
    s.event = null;
    s.events.push({ type: 'gameOver', result });
  }
}
