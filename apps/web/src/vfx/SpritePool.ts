import * as THREE from 'three';
import { GRID, vfxAtlas } from './atlas';

/** How a sprite faces the camera. */
export const MODE = { billboard: 0, ground: 1, streak: 2, upright: 3 } as const;
export type SpriteMode = keyof typeof MODE;

export interface SpriteSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  /** End size multiplier (eased out). */
  grow?: number;
  /** First atlas cell and how many flipbook frames to play over its life. */
  frame: number;
  frames?: number;
  mode?: SpriteMode;
  /** Start / end color (linear rgb, may exceed 1 for bloom). */
  r0: number;
  g0: number;
  b0: number;
  r1: number;
  g1: number;
  b1: number;
  alpha?: number;
  /** Share of the life spent fading in (0 = pops in). */
  fadeIn?: number;
  gravity?: number;
  drag?: number;
  bounce?: boolean;
  rot?: number;
  spin?: number;
  /** Streaks: extra length per unit of speed. */
  stretch?: number;
  delay?: number;
}

// Simulation record layout (one Float32Array, `S` floats per particle).
const PX = 0, PY = 1, PZ = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7, SIZE = 8, GROW = 9, GRAV = 10, DRAG = 11;
const SPIN = 12, ROT = 13, F0 = 14, FN = 15, MOD = 16, BOUNCE = 17, R0 = 18, G0 = 19, B0 = 20, R1 = 21, G1 = 22, B1 = 23;
const ALPHA = 24, FADE = 25, STRETCH = 26, DELAY = 27;
const S = 28;

const vertex = /* glsl */ `
  attribute vec4 aPos;   // xyz, size
  attribute vec4 aVel;   // velocity, stretch
  attribute vec4 aCol;   // rgb, alpha
  attribute vec4 aData;  // frame, rotation, mode, -
  uniform float uCell;
  varying vec2 vUv;
  varying vec4 vCol;
  void main() {
    vCol = aCol;
    float f = aData.x;
    vec2 cell = vec2(mod(f, ${GRID}.0), floor(f / ${GRID}.0));
    vUv = (cell + vec2(uv.x, 1.0 - uv.y)) * uCell;
    float s = aPos.w;
    vec2 p = position.xy;
    float mode = aData.z;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world;
    if (mode > 1.5 && mode < 2.5) {
      // Streak: stretched along the on-screen velocity.
      vec2 sv = vec2(dot(aVel.xyz, right), dot(aVel.xyz, up));
      float len = length(sv);
      vec2 dir = len > 1e-4 ? sv / len : vec2(0.0, 1.0);
      vec2 nrm = vec2(-dir.y, dir.x);
      vec2 q = dir * p.y * (1.0 + len * aVel.w) + nrm * p.x;
      world = aPos.xyz + (right * q.x + up * q.y) * s;
    } else {
      float c = cos(aData.y), sn = sin(aData.y);
      vec2 q = mat2(c, sn, -sn, c) * p;
      if (mode > 0.5 && mode < 1.5) {
        world = aPos.xyz + vec3(q.x, 0.0, -q.y) * s;
      } else if (mode > 2.5) {
        vec3 r = normalize(vec3(right.x, 0.0, right.z) + 1e-5);
        world = aPos.xyz + r * p.x * s + vec3(0.0, (p.y + 0.5) * s, 0.0);
      } else {
        world = aPos.xyz + (right * q.x + up * q.y) * s;
      }
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec4 vCol;
  void main() {
    vec4 t = texture2D(uAtlas, vUv);
    float a = t.a * vCol.a;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vCol.rgb * t.rgb, a);
  }
`;

/**
 * V1: every atlas sprite of one blend mode in a single draw call. Live particles are kept packed
 * at the front of the buffers (swap-remove), so the GPU only draws what is alive.
 */
export class SpritePool {
  readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly sim: Float32Array;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aVel: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;
  private readonly aData: THREE.InstancedBufferAttribute;
  alive = 0;

  constructor(
    readonly cap: number,
    readonly additive: boolean,
    small = false,
  ) {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    const mk = (n: number) => new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n).setUsage(THREE.DynamicDrawUsage);
    this.aPos = mk(4);
    this.aVel = mk(4);
    this.aCol = mk(4);
    this.aData = mk(4);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aCol', this.aCol);
    geo.setAttribute('aData', this.aData);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { uAtlas: { value: vfxAtlas(small) }, uCell: { value: 1 / GRID } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
    this.sim = new Float32Array(cap * S);
  }

  spawn(p: SpriteSpec) {
    // Full: recycle the oldest-looking slot (the first one) rather than drop the new effect.
    const i = this.alive < this.cap ? this.alive++ : Math.floor(Math.random() * this.cap);
    const o = i * S;
    const s = this.sim;
    s[o + PX] = p.x; s[o + PY] = p.y; s[o + PZ] = p.z;
    s[o + VX] = p.vx ?? 0; s[o + VY] = p.vy ?? 0; s[o + VZ] = p.vz ?? 0;
    s[o + AGE] = 0; s[o + LIFE] = Math.max(0.01, p.life);
    s[o + SIZE] = p.size; s[o + GROW] = p.grow ?? 1;
    s[o + GRAV] = p.gravity ?? 0; s[o + DRAG] = p.drag ?? 0;
    s[o + SPIN] = p.spin ?? 0; s[o + ROT] = p.rot ?? 0;
    s[o + F0] = p.frame; s[o + FN] = p.frames ?? 1;
    s[o + MOD] = MODE[p.mode ?? 'billboard'];
    s[o + BOUNCE] = p.bounce ? 1 : 0;
    s[o + R0] = p.r0; s[o + G0] = p.g0; s[o + B0] = p.b0;
    s[o + R1] = p.r1; s[o + G1] = p.g1; s[o + B1] = p.b1;
    s[o + ALPHA] = p.alpha ?? 1; s[o + FADE] = p.fadeIn ?? 0;
    s[o + STRETCH] = p.stretch ?? 0.08;
    s[o + DELAY] = p.delay ?? 0;
  }

  clear() {
    this.alive = 0;
    this.geo.instanceCount = 0;
  }

  update(dt: number) {
    const s = this.sim;
    const pos = this.aPos.array as Float32Array;
    const vel = this.aVel.array as Float32Array;
    const colA = this.aCol.array as Float32Array;
    const data = this.aData.array as Float32Array;
    let i = 0;
    while (i < this.alive) {
      const o = i * S;
      if (s[o + DELAY] > 0) {
        s[o + DELAY] -= dt;
        pos[i * 4 + 3] = 0;
        colA[i * 4 + 3] = 0;
        i++;
        continue;
      }
      s[o + AGE] += dt;
      if (s[o + AGE] >= s[o + LIFE]) {
        // Swap the last live particle into this slot.
        this.alive--;
        if (i !== this.alive) s.copyWithin(o, this.alive * S, this.alive * S + S);
        continue;
      }
      const k = s[o + AGE] / s[o + LIFE];
      s[o + VY] -= s[o + GRAV] * dt;
      const dr = Math.max(0, 1 - s[o + DRAG] * dt);
      s[o + VX] *= dr; s[o + VY] *= dr; s[o + VZ] *= dr;
      s[o + PX] += s[o + VX] * dt; s[o + PY] += s[o + VY] * dt; s[o + PZ] += s[o + VZ] * dt;
      if (s[o + BOUNCE] && s[o + PY] < 0.04) {
        s[o + PY] = 0.04;
        s[o + VY] *= -0.35;
        s[o + VX] *= 0.6;
        s[o + VZ] *= 0.6;
        s[o + SPIN] *= 0.5;
      }
      s[o + ROT] += s[o + SPIN] * dt;
      const grow = 1 + (s[o + GROW] - 1) * (1 - (1 - k) * (1 - k));
      const fade = s[o + FADE];
      const env = fade > 0 && k < fade ? k / fade : 1 - Math.pow((k - fade) / (1 - fade || 1), 2);
      const q = i * 4;
      pos[q] = s[o + PX]; pos[q + 1] = s[o + PY]; pos[q + 2] = s[o + PZ]; pos[q + 3] = s[o + SIZE] * grow;
      vel[q] = s[o + VX]; vel[q + 1] = s[o + VY]; vel[q + 2] = s[o + VZ]; vel[q + 3] = s[o + STRETCH];
      colA[q] = s[o + R0] + (s[o + R1] - s[o + R0]) * k;
      colA[q + 1] = s[o + G0] + (s[o + G1] - s[o + G0]) * k;
      colA[q + 2] = s[o + B0] + (s[o + B1] - s[o + B0]) * k;
      colA[q + 3] = s[o + ALPHA] * Math.max(0, env);
      data[q] = s[o + F0] + Math.min(s[o + FN] - 1, Math.floor(k * s[o + FN]));
      data[q + 1] = s[o + ROT];
      data[q + 2] = s[o + MOD];
      i++;
    }
    this.geo.instanceCount = this.alive;
    if (this.alive) {
      for (const a of [this.aPos, this.aVel, this.aCol, this.aData]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, this.alive * 4);
        a.needsUpdate = true;
      }
    }
  }
}
