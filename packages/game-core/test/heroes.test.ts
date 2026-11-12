import { Cell, CHARACTER_IDS, CHARACTERS, RULES, STARTER_CHARACTERS, secToTicks } from '@4walls/shared';
import { describe, expect, it } from 'vitest';
import { becomeHero, cellIndex, createGame, getCell, setCell, spawnBomb, step, useAbility, type GameState } from '../src';
import { makeGame, placeAt, run } from './helpers';

const adventure = (players = 1, seed = 11) => {
  const s = createGame({
    mode: 'adventure',
    seed,
    width: 0,
    height: 0,
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, slot: i, characterId: 'bombito', name: `P${i + 1}` })),
  });
  s.phase = 'playing';
  return s;
};

/** Frees cage `i` as if a blast had destroyed it, and puts `who` right on it. */
function freeCageUnder(s: GameState, who: string, i = 0) {
  const c = s.adventure!.cages[i];
  setCell(s.grid, c.x, c.y, Cell.Floor);
  step(s, {});
  expect(c.state).toBe('free');
  placeAt(s, who, c.x, c.y);
  step(s, {});
  return c;
}

describe('rescued heroes: roster', () => {
  it('has the three starters plus six heroes to rescue, each with its own ability', () => {
    expect(STARTER_CHARACTERS).toEqual(['bombito', 'ninja', 'engenheiro']);
    expect(CHARACTER_IDS).toHaveLength(9);
    const abilities = new Set(CHARACTER_IDS.map((id) => CHARACTERS[id].ability));
    expect(abilities.size).toBe(9);
  });
});

describe('caged heroes in Adventure', () => {
  it('every region holds one cage: a blocking crate cell, away from Magmitos', () => {
    const s = adventure();
    const adv = s.adventure!;
    expect(adv.cages).toHaveLength(adv.regions.length);
    for (const c of adv.cages) {
      expect(getCell(s.grid, c.x, c.y)).toBe(Cell.Block);
      expect(adv.regionOf[cellIndex(s.grid, c.x, c.y)]).toBe(c.region);
      expect(s.enemies.some((e) => Math.abs(e.x - c.x) + Math.abs(e.y - c.y) <= 1)).toBe(false);
    }
  });

  it('a blast opens the cage, and touching the prisoner turns a lone hero into someone else', () => {
    const s = adventure();
    const before = s.players[0].characterId;
    const c = freeCageUnder(s, 'p1');
    expect(s.events.some((e) => e.type === 'heroJoined')).toBe(true);
    expect(c.state).toBe('rescued');
    const p = s.players[0];
    expect(p.characterId).not.toBe(before);
    expect(p.alive).toBe(true);
    expect(p.abilityReadyTick).toBeLessThanOrEqual(s.tick);
  });

  it('with a fallen ally, the ally comes back as the hero (the rescuer stays who they were)', () => {
    const s = adventure(2);
    const [p1, p2] = s.players;
    p2.alive = false;
    p2.diedTick = s.tick;
    freeCageUnder(s, 'p1');
    expect(p1.characterId).toBe('bombito');
    expect(p2.alive).toBe(true);
    expect(p2.characterId).not.toBe('bombito');
    expect(p2.invulnUntil).toBeGreaterThan(s.tick + 60);
    const joined = s.events.find((e) => e.type === 'heroJoined');
    expect(joined).toMatchObject({ playerId: 'p2', byId: 'p1', revived: true, previousId: 'bombito' });
  });

  it('players who left the online match are never revived: the rescuer transforms instead', () => {
    const s = adventure(2);
    const [p1, p2] = s.players;
    p2.alive = false;
    p2.left = true;
    freeCageUnder(s, 'p1');
    expect(p2.alive).toBe(false);
    expect(p1.characterId).not.toBe('bombito');
  });

  it('the draw covers every hero and is deterministic per seed', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const s = adventure(1, seed);
      freeCageUnder(s, 'p1');
      seen.add(s.players[0].characterId);
      const again = adventure(1, seed);
      freeCageUnder(again, 'p1');
      expect(again.players[0].characterId).toBe(s.players[0].characterId);
    }
    expect(seen.size).toBe(CHARACTER_IDS.length - 1); // everyone but the one you already are
  });

  it('changing class keeps earned power-ups and re-bases the class perks', () => {
    const s = makeGame({ players: 1 });
    const p = s.players[0];
    p.speed += RULES.speedStep; // one Speed Up
    p.range = 4;
    becomeHero(s, p, 'senha');
    expect(p.speed).toBeCloseTo(RULES.baseSpeed + RULES.speedStep + CHARACTERS.senha.speedBonus);
    expect(p.range).toBe(4);
    becomeHero(s, p, 'reipelota');
    expect(p.canKick).toBe(true);
    expect(p.maxBombs).toBeLessThanOrEqual(CHARACTERS.reipelota.maxBombs);
  });
});

describe('rescued heroes: abilities', () => {
  const hero = (id: string, x = 3, y = 3) => {
    const s = makeGame({ players: 2, characters: [id, 'bombito'] });
    placeAt(s, 'p2', 11, 9);
    const p = placeAt(s, 'p1', x, y);
    return { s, p };
  };

  it('Turbo (Ayrton Senha) doubles the speed for a moment', () => {
    const { s, p } = hero('senha', 1, 1);
    p.facing = 'right';
    run(s, 10, { p1: { move: 'right', bomb: false, ability: false } });
    const normal = p.x - 1;
    placeAt(s, 'p1', 1, 1);
    useAbility(s, p);
    run(s, 10, { p1: { move: 'right', bomb: false, ability: false } });
    expect(p.x - 1).toBeGreaterThan(normal * 1.8);
  });

  it('Bicicleta (Rei Pelota) drops a bomb that slides away', () => {
    const { s, p } = hero('reipelota', 1, 1);
    p.facing = 'right';
    useAbility(s, p);
    expect(s.bombs).toHaveLength(1);
    run(s, 20);
    expect(s.bombs[0].x).toBeGreaterThan(2);
  });

  it('Quem quer bomba? (Silvio Bombos) puts a power-up next to him', () => {
    const { s, p } = hero('silvio');
    useAbility(s, p);
    expect(s.powerups).toHaveLength(1);
    const pu = s.powerups[0];
    expect(Math.abs(pu.x - 3) + Math.abs(pu.y - 3)).toBe(1);
  });

  it('Gargalhada (Tiringão) freezes nearby Magmitos and Versus rivals, not far ones', () => {
    const { s, p } = hero('tiringao');
    placeAt(s, 'p2', 5, 3);
    s.enemies.push({ id: 900, kind: 'magmite', x: 3, y: 5, px: 3, py: 5, dir: null, tx: 3, ty: 5, alive: true, diedTick: -1, frozenUntil: 0, regionId: -1 });
    s.enemies.push({ id: 901, kind: 'magmite', x: 11, y: 1, px: 11, py: 1, dir: null, tx: 11, ty: 1, alive: true, diedTick: -1, frozenUntil: 0, regionId: -1 });
    useAbility(s, p);
    expect(s.enemies[0].frozenUntil).toBeGreaterThan(s.tick);
    expect(s.enemies[1].frozenUntil).toBe(0);
    expect(s.players[1].frozenUntil).toBeGreaterThan(s.tick);
    expect(p.frozenUntil).toBe(0);
  });

  it('Forró Sísmico (Luiz Bombzaga) pushes nearby bombs away', () => {
    const { s, p } = hero('bombzaga');
    const b = spawnBomb(s, { ownerId: 'p2', x: 5, y: 3, range: 1 });
    useAbility(s, p);
    expect(b.slideDir).toBe('right');
    run(s, 15);
    expect(b.x).toBeGreaterThan(5);
  });

  it('Bacamarte (Bombião) bursts ahead without hurting the shooter, and sets off bombs in its path', () => {
    const { s, p } = hero('bombiao', 1, 1);
    p.facing = 'right';
    useAbility(s, p);
    expect(s.flames.some((f) => f.x === 4 && f.y === 1)).toBe(true);
    run(s, secToTicks(RULES.flameSec) + 2);
    expect(p.alive).toBe(true);

    const t = hero('bombiao', 1, 1);
    t.p.facing = 'right';
    const b = spawnBomb(t.s, { ownerId: 'p2', x: 3, y: 1, range: 1 });
    useAbility(t.s, t.p);
    expect(t.s.bombs.includes(b)).toBe(false);
  });
});
