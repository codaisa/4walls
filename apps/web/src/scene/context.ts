import { createContext, useContext } from 'react';
import type { MatchView } from '../game/presentation';

export interface FxBus {
  /** Camera trauma (0..1), decays over time. */
  shake: number;
}

export interface SceneCtx {
  controller: MatchView;
  fx: FxBus;
  /** Converts grid coordinates to world X/Z (arena centered at the origin). */
  ox: number;
  oz: number;
}

export const GameContext = createContext<SceneCtx | null>(null);

export function useGame(): SceneCtx {
  const c = useContext(GameContext);
  if (!c) throw new Error('useGame must be used inside <GameScene>');
  return c;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Frame-rate independent smoothing factor. */
export const damp = (lambda: number, dt: number) => 1 - Math.exp(-lambda * dt);
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
