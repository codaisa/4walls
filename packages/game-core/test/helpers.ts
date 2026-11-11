import { Cell, EMPTY_INPUT, type PlayerInput } from '@4walls/shared';
import { createGame, setCell, step, type GameState, type InputMap } from '../src';

/** A versus game already in the 'playing' phase with every destructible block removed. */
export function makeGame(opts: { players?: number; mode?: 'solo' | 'versus'; enemies?: number; characters?: string[]; events?: boolean } = {}): GameState {
  const n = opts.players ?? 2;
  const s = createGame({
    mode: opts.mode ?? 'versus',
    seed: 1234,
    width: 13,
    height: 11,
    enemyCount: opts.enemies ?? 0,
    events: opts.events ?? false,
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, slot: i, characterId: opts.characters?.[i] ?? 'bombito', name: `P${i + 1}` })),
  });
  for (let y = 0; y < s.grid.h; y++)
    for (let x = 0; x < s.grid.w; x++) if (s.grid.cells[y * s.grid.w + x] === Cell.Block) setCell(s.grid, x, y, Cell.Floor);
  s.phase = 'playing';
  return s;
}

export function run(s: GameState, ticks: number, inputs: InputMap = {}) {
  for (let i = 0; i < ticks; i++) step(s, inputs);
}

export const input = (p: Partial<PlayerInput>): PlayerInput => ({ ...EMPTY_INPUT, ...p });

export function placeAt(s: GameState, id: string, x: number, y: number) {
  const p = s.players.find((pp) => pp.id === id)!;
  p.x = p.px = x;
  p.y = p.py = y;
  return p;
}
