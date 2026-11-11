import { RULES, secToTicks } from '@4walls/shared';
import { describe, expect, it } from 'vitest';
import { createGame, hitPlayer, step, tryPlaceBomb } from '../src';
import { input, makeGame, placeAt, run } from './helpers';

describe('local multiplayer (core)', () => {
  it('four players spawn in four distinct corners', () => {
    const s = makeGame({ players: 4 });
    const spots = new Set(s.players.map((p) => `${p.x},${p.y}`));
    expect(spots.size).toBe(4);
  });

  it('each player follows only its own input', () => {
    const s = makeGame({ players: 4 });
    const start = s.players.map((p) => [p.x, p.y]);
    run(s, 20, { p1: input({ move: 'right' }), p2: input({ move: 'left' }), p3: input({ move: 'down' }) });
    expect(s.players[0].x).toBeGreaterThan(start[0][0]);
    expect(s.players[1].x).toBeLessThan(start[1][0]);
    expect(s.players[2].y).toBeGreaterThan(start[2][1]);
    expect([s.players[3].x, s.players[3].y]).toEqual(start[3]);
  });

  it('bombs are counted per owner', () => {
    const s = makeGame({ players: 2 });
    expect(tryPlaceBomb(s, s.players[0])).not.toBeNull();
    expect(tryPlaceBomb(s, s.players[1])).not.toBeNull();
    expect(tryPlaceBomb(s, s.players[0])).toBeNull();
  });

  it('the match continues while two or more players are alive', () => {
    const s = makeGame({ players: 4 });
    hitPlayer(s, s.players[0], 'p2');
    hitPlayer(s, s.players[1], null);
    step(s, {});
    expect(s.phase).toBe('playing');
    hitPlayer(s, s.players[2], 'p4');
    step(s, {});
    expect(s.result).toMatchObject({ outcome: 'winner', winnerIds: ['p4'] });
    expect(s.players[3].kills).toBe(1);
  });

  it('players caught by the same blast together produce a draw', () => {
    const s = makeGame({ players: 2 });
    placeAt(s, 'p2', 2, 1);
    tryPlaceBomb(s, s.players[0]);
    run(s, secToTicks(RULES.fuseSec) + 1);
    expect(s.result).toMatchObject({ outcome: 'draw' });
  });

  it('co-op (solo rules) only fails when every player is down', () => {
    const s = makeGame({ mode: 'solo', players: 2, enemies: 1 });
    s.enemies[0].x = s.enemies[0].tx = 7;
    s.enemies[0].y = s.enemies[0].ty = 5;
    hitPlayer(s, s.players[0], null);
    step(s, {});
    expect(s.phase).toBe('playing');
    hitPlayer(s, s.players[1], null);
    step(s, {});
    expect(s.result).toMatchObject({ outcome: 'defeat' });
  });

  it('cosmetic color is independent from the gameplay slot', () => {
    const s = createGame({
      mode: 'versus', seed: 1, width: 15, height: 13,
      players: [{ id: 'a', slot: 0, characterId: 'bombito', name: 'A', colorIndex: 3 }],
    });
    expect(s.players[0]).toMatchObject({ slot: 0, colorIndex: 3, x: 1, y: 1 });
  });
});
