import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  COSMETICS,
  EMPTY_STATS,
  MAX_LEVEL,
  SEASONS,
  applyMatchToStats,
  currentSeason,
  earnedItems,
  levelInfo,
  matchReward,
  sanitizeLoadout,
  xpToNext,
  type MatchPerformance,
} from '@4walls/shared';

const perf = (p: Partial<MatchPerformance> = {}): MatchPerformance => ({
  mode: 'versus',
  outcome: 'loss',
  players: 2,
  kills: 0,
  enemies: 0,
  died: true,
  blocks: 0,
  powerups: 0,
  bosses: [],
  bossRushClear: false,
  seconds: 120,
  ...p,
});

describe('levels', () => {
  it('level boundaries follow the XP curve and cap at the max level', () => {
    expect(levelInfo(0)).toEqual({ level: 1, xpInLevel: 0, xpForLevel: xpToNext(1) });
    expect(levelInfo(xpToNext(1) - 1).level).toBe(1);
    expect(levelInfo(xpToNext(1)).level).toBe(2);
    expect(levelInfo(xpToNext(1) + xpToNext(2)).level).toBe(3);
    expect(levelInfo(1e9).level).toBe(MAX_LEVEL);
    for (let l = 1; l < MAX_LEVEL; l++) expect(xpToNext(l + 1)).toBeGreaterThan(xpToNext(l));
  });
});

describe('match rewards (balance)', () => {
  it('instant self-knockouts give (almost) nothing: no XP farming', () => {
    expect(matchReward(perf({ seconds: 3 })).xp).toBeLessThanOrEqual(1);
  });

  it('playing longer, winning and fighting pay more', () => {
    const base = matchReward(perf()).xp;
    expect(matchReward(perf({ outcome: 'win' })).xp).toBeGreaterThan(base);
    expect(matchReward(perf({ kills: 2 })).xp).toBeGreaterThan(base);
    expect(matchReward(perf({ seconds: 40 })).xp).toBeLessThan(base);
  });

  it('a Versus "win" alone is practice; with rivals it scales with their number', () => {
    const solo = matchReward(perf({ outcome: 'win', players: 1 }));
    expect(solo.lines.some((l) => l.label === 'Vitória')).toBe(false);
    expect(matchReward(perf({ outcome: 'win', players: 4 })).xp).toBeGreaterThan(matchReward(perf({ outcome: 'win', players: 2 })).xp);
  });

  it('capped categories cannot be inflated by grinding blocks or enemies', () => {
    const r = matchReward(perf({ blocks: 10_000, enemies: 10_000, powerups: 10_000 }));
    expect(r.xp).toBeLessThan(400);
  });

  it('a typical match is worth a meaningful slice of a level (a few matches per early level)', () => {
    const typical = matchReward(perf({ outcome: 'win', kills: 1, blocks: 20, powerups: 3, seconds: 150 })).xp;
    expect(typical).toBeGreaterThan(xpToNext(1) / 2);
    expect(typical).toBeLessThan(xpToNext(1) * 2.5);
  });

  it('stats accumulate and the win streak resets on a loss', () => {
    let s = applyMatchToStats(EMPTY_STATS, perf({ outcome: 'win' }));
    s = applyMatchToStats(s, perf({ outcome: 'win' }));
    expect(s.winStreak).toBe(2);
    s = applyMatchToStats(s, perf());
    expect(s).toMatchObject({ matches: 3, wins: 2, losses: 1, winStreak: 0, bestWinStreak: 2 });
  });
});

describe('cosmetics catalog', () => {
  it('every item can be obtained somehow and points at real achievements / seasons', () => {
    for (const c of Object.values(COSMETICS)) {
      const ways = [c.starter, c.price > 0, c.level !== undefined, c.achievement !== undefined, c.season !== undefined].filter(Boolean);
      expect(ways.length, c.id).toBeGreaterThan(0);
      if (c.achievement) expect(ACHIEVEMENTS.some((a) => a.id === c.achievement), c.id).toBe(true);
      if (c.season) expect(SEASONS.some((s) => s.id === c.season!.id), c.id).toBe(true);
      if (c.level) expect(c.level).toBeLessThanOrEqual(MAX_LEVEL);
    }
  });

  it('earned items follow level, achievements and season XP', () => {
    expect(earnedItems(1, [], {})).toEqual(['title_novato']);
    expect(earnedItems(10, [], {})).toEqual(expect.arrayContaining(['hat_aureola', 'bomb_magma', 'fire_roxo']));
    expect(earnedItems(1, ['golem_slayer'], {})).toContain('hat_chifres');
    expect(earnedItems(1, [], { 's1-vulcanica': 3000 })).toContain('bomb_vulcanica');
  });

  it('loadouts only keep owned items in the right slot', () => {
    expect(sanitizeLoadout({ hat: 'hat_coroa', bomb: 'hat_bone', fire: 'x', title: 'title_novato' }, ['hat_coroa', 'title_novato', 'hat_bone'])).toEqual({
      hat: 'hat_coroa',
      bomb: null,
      fire: null,
      title: 'title_novato',
    });
    expect(sanitizeLoadout(null, [])).toEqual({ hat: null, bomb: null, fire: null, title: null });
  });

  it('seasons are contiguous and one is always current', () => {
    for (let i = 1; i < SEASONS.length; i++) expect(SEASONS[i].start).toBe(SEASONS[i - 1].end);
    expect(currentSeason(Date.parse('2026-12-01')).id).toBe('s1-vulcanica');
    expect(currentSeason(Date.parse('2027-03-01')).id).toBe('s2-congelante');
  });
});
