import type { ModeId } from '@4walls/shared';
import type { GameResult, GameState } from './types';

/**
 * Each mode supplies its own win/lose rule. New modes (Battle Royale, Boss Rush, Team Chaos)
 * register here without touching the simulation loop.
 */
export interface ModeRules {
  id: ModeId;
  defaultEnemies: number;
  checkEnd(s: GameState): GameResult | null;
}

const alive = (s: GameState) => s.players.filter((p) => p.alive);

/** Magmitos that keep a lone Versus player company. */
export const VERSUS_PRACTICE_ENEMIES = 3;

export const MODES: Record<ModeId, ModeRules> = {
  solo: {
    id: 'solo',
    defaultEnemies: 5,
    checkEnd(s) {
      if (alive(s).length === 0) return { outcome: 'defeat', winnerIds: [], reason: 'allPlayersDown' };
      if (s.enemies.length > 0 && s.enemies.every((e) => !e.alive))
        return { outcome: 'victory', winnerIds: alive(s).map((p) => p.id), reason: 'allEnemiesDown' };
      if (s.timeLeftTicks <= 0) return { outcome: 'defeat', winnerIds: [], reason: 'timeUp' };
      return null;
    },
  },
  adventure: {
    id: 'adventure',
    defaultEnemies: 0, // each region spawns its own (adventure.ts)
    checkEnd(s) {
      // Endless: the journey only ends when the whole group is down.
      if (alive(s).length === 0) return { outcome: 'defeat', winnerIds: [], reason: 'allPlayersDown' };
      return null;
    },
  },
  bossrush: {
    id: 'bossrush',
    defaultEnemies: 0,
    checkEnd(s) {
      if (alive(s).length === 0) return { outcome: 'defeat', winnerIds: [], reason: 'allPlayersDown' };
      if (!s.boss && s.bossQueue.length === 0 && s.bossesDefeated > 0)
        return { outcome: 'victory', winnerIds: alive(s).map((p) => p.id), reason: 'bossesDefeated' };
      if (s.timeLeftTicks <= 0) return { outcome: 'defeat', winnerIds: [], reason: 'timeUp' };
      return null;
    },
  },
  versus: {
    id: 'versus',
    defaultEnemies: 0,
    checkEnd(s) {
      // A single player has nobody to outlast: practice rules (clear the Magmitos, don't die).
      if (s.players.length === 1) return MODES.solo.checkEnd(s);
      const a = alive(s);
      if (a.length === 1) return { outcome: 'winner', winnerIds: [a[0].id], reason: 'lastStanding' };
      if (a.length === 0) return { outcome: 'draw', winnerIds: [], reason: 'allPlayersDown' };
      if (s.timeLeftTicks <= 0) return { outcome: 'draw', winnerIds: [], reason: 'timeUp' };
      return null;
    },
  },
};
