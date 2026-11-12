import { Cell, RULES } from '@4walls/shared';
import { nextRandom } from './rng';
import type { Grid } from './types';

/**
 * A grid is a window onto world coordinates: cell (x, y) lives at index (y - y0) * w + (x - x0).
 * Arenas use x0 = y0 = 0; the endless Adventure slides the window along as regions come and go,
 * so players, bombs and enemies never change coordinates.
 */
export function createGrid(w: number, h: number, x0 = 0, y0 = 0): Grid {
  return { w, h, x0, y0, cells: new Uint8Array(w * h) };
}

export const inBounds = (g: Grid, x: number, y: number) => x >= g.x0 && y >= g.y0 && x < g.x0 + g.w && y < g.y0 + g.h;
export const cellIndex = (g: Grid, x: number, y: number) => (y - g.y0) * g.w + (x - g.x0);

export function getCell(g: Grid, x: number, y: number): Cell {
  if (!inBounds(g, x, y)) return Cell.Wall;
  return g.cells[cellIndex(g, x, y)] as Cell;
}

export function setCell(g: Grid, x: number, y: number, c: Cell) {
  if (inBounds(g, x, y)) g.cells[cellIndex(g, x, y)] = c;
}

/** Corner spawn points, in slot order (P1 top-left, P2 bottom-right, P3 top-right, P4 bottom-left). */
export function spawnPoints(w: number, h: number) {
  return [
    { x: 1, y: 1 },
    { x: w - 2, y: h - 2 },
    { x: w - 2, y: 1 },
    { x: 1, y: h - 2 },
  ];
}

/**
 * Classic arena layout: solid border, a pillar on every even/even cell and destructible blocks
 * sprinkled at random, keeping an L-shaped safe pocket around every spawn.
 */
export function generateArena(w: number, h: number, rngHolder: { rng: number }, fill: number = RULES.blockFill): Grid {
  const g = createGrid(w, h);
  const spawns = spawnPoints(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      const pillar = x % 2 === 0 && y % 2 === 0;
      if (border || pillar) {
        setCell(g, x, y, Cell.Wall);
        continue;
      }
      const safe = spawns.some((s) => Math.abs(s.x - x) + Math.abs(s.y - y) <= 2);
      if (!safe && nextRandom(rngHolder) < fill) setCell(g, x, y, Cell.Block);
    }
  }
  return g;
}
