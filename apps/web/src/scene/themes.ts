import type { ArenaId } from '@4walls/shared';

/**
 * Visual identity of each arena. Gameplay is identical; only presentation changes.
 * Add an arena = one entry here + an ArenaDef in @4walls/shared.
 */
export interface ArenaTheme {
  id: ArenaId;
  background: string;
  fog: [near: number, far: number];
  hemi: [sky: string, ground: string, intensity: number];
  ambient: string;
  sun: { color: string; intensity: number };
  rim: { color: string; intensity: number };
  floor: [string, string];
  /** Color seen through the gaps between floor tiles (HDR for glow). */
  seam: [number, number, number];
  border: string;
  pillar: 'basalt' | 'tree';
  pillarColor: string;
  block: 'clay' | 'crate';
  blockColors: [string, string];
  /** Rune/strap on blocks; glowing when emissive. */
  mark: { color: [number, number, number]; emissive: boolean };
  liquid: 'lava' | 'water';
  particles: 'embers' | 'fireflies';
  corner: 'brazier' | 'lantern';
  music: 'volcano' | 'forest';
}

export const THEMES: Record<ArenaId, ArenaTheme> = {
  caldeira: {
    id: 'caldeira',
    background: '#1a0d10',
    fog: [28, 75],
    hemi: ['#ffd6b0', '#3a1c24', 0.55],
    ambient: '#ff9a6a',
    sun: { color: '#fff0dc', intensity: 2.1 },
    rim: { color: '#ff6a3a', intensity: 0.8 },
    floor: ['#62546a', '#54485c'],
    seam: [1.5, 0.32, 0.05],
    border: '#2a2330',
    pillar: 'basalt',
    pillarColor: '#34293a',
    block: 'clay',
    blockColors: ['#a8714f', '#9a6547'],
    mark: { color: [1.6, 0.75, 0.2], emissive: true },
    liquid: 'lava',
    particles: 'embers',
    corner: 'brazier',
    music: 'volcano',
  },
  floresta: {
    id: 'floresta',
    background: '#132219',
    fog: [26, 70],
    hemi: ['#dff3ff', '#2e3d22', 0.75],
    ambient: '#bfe8a8',
    sun: { color: '#fff1cf', intensity: 2.4 },
    rim: { color: '#7fd6ff', intensity: 0.6 },
    floor: ['#6a9a45', '#5c8a3c'],
    seam: [0.12, 0.08, 0.05],
    border: '#55604c',
    pillar: 'tree',
    pillarColor: '#6b4428',
    block: 'crate',
    blockColors: ['#b07a44', '#a06c3a'],
    mark: { color: [0.32, 0.2, 0.1], emissive: false },
    liquid: 'water',
    particles: 'fireflies',
    corner: 'lantern',
    music: 'forest',
  },
};
