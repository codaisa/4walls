import { Cell, GAME_EVENTS, RULES, secToTicks, type GameEventId } from '@4walls/shared';
import { destroyBlock, detonate, spawnBomb } from './bombs';
import { getCell } from './grid';
import { pickWeighted, randInt } from './rng';
import type { GameState } from './types';
import { bombAt, newId } from './world';

/**
 * Random arena events. Announced RULES.eventWarnSec ahead, active for RULES.eventDurationSec,
 * then the next one is scheduled. Runs inside the deterministic simulation, so the online
 * server drives it and every client sees the same thing.
 */
export interface ArenaEventDef {
  id: GameEventId;
  weight: number;
  /** Called every tick while active. */
  tick?(s: GameState, activeTicks: number): void;
}

export const ARENA_EVENTS: Record<GameEventId, ArenaEventDef> = {
  meteors: {
    id: 'meteors',
    weight: 1,
    tick(s, activeTicks) {
      if (activeTicks % secToTicks(RULES.meteorEverySec) !== 0) return;
      const { w, h } = s.grid;
      // Any non-wall cell; a short warning marker lets players dodge.
      for (let tries = 0; tries < 20; tries++) {
        const x = 1 + randInt(s, w - 2);
        const y = 1 + randInt(s, h - 2);
        if (getCell(s.grid, x, y) === Cell.Wall || s.meteors.some((m) => m.x === x && m.y === y)) continue;
        s.meteors.push({ id: newId(s), x, y, spawnTick: s.tick, impactTick: s.tick + secToTicks(RULES.meteorFallSec) });
        return;
      }
    },
  },
  /** Movement-side effect lives in stepPlayerMovement (players keep sliding). */
  iceFloor: { id: 'iceFloor', weight: 1 },
};

export function scheduleFirstEvent(s: GameState) {
  s.nextEventTick = s.config.events === false ? -1 : s.countdownTicks + secToTicks(RULES.eventFirstSec);
}

export function updateArenaEvents(s: GameState) {
  const ev = s.event;
  if (!ev) {
    if (s.nextEventTick >= 0 && s.tick >= s.nextEventTick) {
      const def = pickWeighted(s, Object.values(ARENA_EVENTS), (d) => d.weight);
      const start = s.tick + secToTicks(RULES.eventWarnSec);
      s.event = { type: def.id, phase: 'warning', warnTick: s.tick, startTick: start, endTick: start + secToTicks(RULES.eventDurationSec) };
      s.events.push({ type: 'eventWarning', event: def.id });
    }
  } else if (ev.phase === 'warning' && s.tick >= ev.startTick) {
    ev.phase = 'active';
    s.events.push({ type: 'eventStart', event: ev.type });
  } else if (ev.phase === 'active') {
    if (s.tick >= ev.endTick) {
      s.events.push({ type: 'eventEnd', event: ev.type });
      s.event = null;
      s.nextEventTick = s.tick + secToTicks(RULES.eventIntervalSec);
      for (const p of s.players) p.slideDir = null;
    } else {
      ARENA_EVENTS[ev.type].tick?.(s, s.tick - ev.startTick);
    }
  }
  updateMeteors(s);
}

/** A meteor blasts its own cell: breaks a block there, chains bombs, kills whoever stands on it. */
function updateMeteors(s: GameState) {
  for (const m of [...s.meteors]) {
    if (s.tick < m.impactTick) continue;
    s.meteors.splice(s.meteors.indexOf(m), 1);
    if (getCell(s.grid, m.x, m.y) === Cell.Block) destroyBlock(s, m.x, m.y, 'meteor');
    const existing = bombAt(s, m.x, m.y);
    detonate(s, existing ?? spawnBomb(s, { ownerId: 'meteor', x: m.x, y: m.y, range: 0, extra: true, silent: true }));
    s.events.push({ type: 'meteorImpact', x: m.x, y: m.y });
  }
}

export const eventName = (id: GameEventId) => GAME_EVENTS[id].name;
