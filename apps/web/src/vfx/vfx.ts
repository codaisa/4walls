import * as THREE from 'three';
import { FLIPBOOK, SPRITES, type SpriteName } from './atlas';
import { SpritePool, type SpriteMode } from './SpritePool';
import { PRESETS, type PresetId } from './presets';

export type Range = number | readonly [number, number];

/** One layer of an effect: a burst of identical sprites with randomized ranges. */
export interface EmitterSpec {
  sprite: SpriteName;
  /** Play the sprite's flipbook frames over each particle's life. */
  flipbook?: boolean;
  additive?: boolean;
  mode?: SpriteMode;
  count: Range;
  /** Lowest graphics tier this layer shows on (0 low, 1 medium, 2 high). */
  minTier?: 0 | 1 | 2;
  life: Range;
  size: Range;
  grow?: Range;
  /** Spawn offset: disc radius on the floor and height above the origin. */
  radius?: number;
  height?: Range;
  /** Outward speed on the floor plane, and vertical speed. */
  speed?: Range;
  up?: Range;
  /** Even angles instead of random ones (rings of sparks). */
  ring?: boolean;
  /** With a direction in the emit options: spread (radians) around it. */
  cone?: number;
  /** Start color, end color (defaults to the start). `tint` in the emit options replaces both. */
  colors: readonly [string, string?];
  intensity?: number;
  alpha?: Range;
  fadeIn?: number;
  gravity?: number;
  drag?: number;
  bounce?: boolean;
  spin?: Range;
  randomRot?: boolean;
  stretch?: number;
  delay?: Range;
}

export interface VfxPreset {
  label: string;
  group: 'Combate' | 'Chefes' | 'Mundo' | 'Interface';
  desc: string;
  emitters: readonly EmitterSpec[];
  /** Camera trauma added by the effect (the caller applies it). */
  shake?: number;
}

export interface EmitOptions {
  scale?: number;
  /** Replaces the preset colors (e.g. the player's color). */
  tint?: THREE.ColorRepresentation;
  /** Floor direction (x, z) for directional layers. */
  dir?: readonly [number, number];
  /** Multiplies particle counts. */
  amount?: number;
  /** Extra delay for the whole effect (s), e.g. staggered along a blast arm. */
  delay?: number;
}

const pick = (r: Range | undefined, d = 0) => (r === undefined ? d : typeof r === 'number' ? r : r[0] + Math.random() * (r[1] - r[0]));
const c0 = new THREE.Color();
const c1 = new THREE.Color();

/**
 * V1: the effect library's entry point. Effects are data (presets.ts); `vfx.emit(id, x, y, z)`
 * plays one anywhere a <VfxLayer> is mounted. Two draw calls in total (additive + blended).
 */
class VfxManager {
  add: SpritePool | null = null;
  blend: SpritePool | null = null;
  tier: 0 | 1 | 2 = 2;
  /** Share of particles kept (graphics quality). */
  density = 1;
  private acc = 0;

  emit(id: PresetId, x: number, y: number, z: number, o: EmitOptions = {}) {
    const preset = PRESETS[id] as VfxPreset | undefined;
    if (!preset || !this.add || !this.blend) return preset;
    const scale = o.scale ?? 1;
    for (const e of preset.emitters) {
      if ((e.minTier ?? 0) > this.tier) continue;
      const pool = e.additive ? this.add : this.blend;
      const want = pick(e.count) * (o.amount ?? 1);
      // Density applies to big bursts; single sprites (cores, rings, decals) always show.
      let n = want <= 2 ? Math.round(want) : Math.floor(want * this.density);
      if (want > 2) {
        this.acc += want * this.density - n;
        if (this.acc >= 1) {
          n++;
          this.acc -= 1;
        }
      }
      if (o.tint !== undefined) {
        c0.set(o.tint);
        c1.copy(c0).multiplyScalar(0.6);
      } else {
        c0.set(e.colors[0]);
        c1.set(e.colors[1] ?? e.colors[0]);
      }
      const I = e.intensity ?? 1;
      const frames = e.flipbook ? (FLIPBOOK[e.sprite] ?? 1) : 1;
      const baseAng = o.dir ? Math.atan2(o.dir[1], o.dir[0]) : 0;
      for (let i = 0; i < n; i++) {
        const a = o.dir && e.cone !== undefined ? baseAng + (Math.random() - 0.5) * e.cone : e.ring ? (i / n) * Math.PI * 2 + Math.random() * 0.2 : Math.random() * Math.PI * 2;
        const rr = (e.radius ?? 0) * Math.sqrt(Math.random()) * scale;
        const ra = Math.random() * Math.PI * 2;
        const sp = pick(e.speed) * scale;
        pool.spawn({
          x: x + Math.cos(ra) * rr,
          y: y + pick(e.height) * scale,
          z: z + Math.sin(ra) * rr,
          vx: Math.cos(a) * sp,
          vy: pick(e.up) * scale,
          vz: Math.sin(a) * sp,
          life: pick(e.life),
          size: pick(e.size) * scale,
          grow: pick(e.grow, 1),
          frame: SPRITES[e.sprite],
          frames,
          mode: e.mode,
          r0: c0.r * I, g0: c0.g * I, b0: c0.b * I,
          r1: c1.r * I, g1: c1.g * I, b1: c1.b * I,
          alpha: pick(e.alpha, 1),
          fadeIn: e.fadeIn,
          gravity: (e.gravity ?? 0) * scale,
          drag: e.drag,
          bounce: e.bounce,
          rot: e.randomRot === false ? 0 : Math.random() * Math.PI * 2,
          spin: pick(e.spin) * (Math.random() < 0.5 ? -1 : 1),
          stretch: e.stretch,
          delay: pick(e.delay) + (o.delay ?? 0),
        });
      }
    }
    return preset;
  }

  /** Live sprites (for the dev meter). */
  get count() {
    return (this.add?.alive ?? 0) + (this.blend?.alive ?? 0);
  }
}

export const vfx = new VfxManager();
export type { PresetId };

if (import.meta.env.DEV) (window as unknown as { __vfx: VfxManager }).__vfx = vfx;
