import * as THREE from 'three';
import { NOISE_GLSL, RAMP_GLSL } from './vfxShaders';

/** How a soft particle pool is drawn. */
export type SoftMode = 'smoke' | 'fireball' | 'decal' | 'shockwave';

export interface SoftSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  /** Final size multiplier (1 = constant). */
  grow?: number;
  color: THREE.ColorRepresentation;
  alpha?: number;
  drag?: number;
  /** Delay before the particle appears (s). */
  delay?: number;
  /** For fireballs: fire kind (0 normal, 1 hellfire, 2 ice). */
  kind?: number;
}

const vertex = /* glsl */ `
  attribute vec4 aCol;   // rgb, alpha
  attribute vec2 aMisc;  // seed, kind
  uniform float uFlat;
  varying vec2 vUv;
  varying vec4 vCol;
  varying vec2 vMisc;
  void main() {
    vUv = uv;
    vCol = aCol;
    vMisc = aMisc;
    vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float s = length(instanceMatrix[0].xyz);
    float a = aMisc.x * 6.2831;
    vec2 p = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
    vec3 world;
    if (uFlat > 0.5) {
      world = center + vec3(p.x, 0.0, p.y) * s;
    } else {
      vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
      vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
      world = center + (right * p.x + up * p.y) * s;
    }
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const fragment = /* glsl */ `
  uniform float uMode; // 0 smoke, 1 fireball, 2 decal, 3 shockwave
  uniform float uTime;
  varying vec2 vUv;
  varying vec4 vCol;
  varying vec2 vMisc;
  ${NOISE_GLSL}
  ${RAMP_GLSL}
  void main() {
    vec2 d = vUv - 0.5;
    float r = length(d) * 2.0;
    float n = vfxFbm(vUv * 3.2 + vMisc.x * 37.0);
    float mask = 1.0 - smoothstep(0.3, 1.0, r + (n - 0.5) * 0.7);
    if (uMode < 0.5) {
      // Soft billowing smoke, lit a little from above.
      float a = mask * vCol.a;
      if (a < 0.005) discard;
      vec3 col = vCol.rgb * (0.65 + 0.7 * n) * (1.0 + 0.25 * (0.5 - vUv.y));
      gl_FragColor = vec4(col, a);
    } else if (uMode < 1.5) {
      // Fireball: churning turbulence; hot core, edges cool into dark soot as it burns out.
      float life = vCol.a;
      float n1 = vfxFbm(vUv * 2.6 + vMisc.x * 37.0 + vec2(0.0, -uTime * 1.4));
      float n2 = vfxFbm(vUv * 5.0 - vMisc.x * 11.0 + vec2(uTime * 0.8, -uTime * 2.2));
      float m = 1.0 - smoothstep(0.2, 1.0, r + (n1 - 0.5) * 0.9);
      float heat = clamp(m * (0.45 + 0.85 * n2) * (0.3 + 0.8 * life) - (1.0 - life) * 0.3, 0.0, 1.0);
      vec3 fire = heatRamp(heat, vMisc.y) * 0.7;
      float cool = smoothstep(0.32, 0.04, heat);
      vec3 rim = vMisc.y > 1.5 ? vec3(0.78, 0.92, 1.0) : vec3(0.07, 0.05, 0.05) * (0.7 + 0.6 * n1);
      vec3 col = mix(fire, rim, cool);
      float a = smoothstep(0.02, 0.3, m) * min(1.0, life * 1.8);
      if (a < 0.01) discard;
      gl_FragColor = vec4(col, a);
    } else if (uMode > 2.5) {
      // Shockwave: thin hot ring racing outward along the floor.
      float ring = exp(-pow((r - 0.82) * 11.0, 2.0)) * (0.7 + 0.6 * n);
      float a = (ring + 0.12 * (1.0 - smoothstep(0.0, 0.82, r))) * vCol.a;
      if (a < 0.01) discard;
      gl_FragColor = vec4(vCol.rgb * ring * 2.2, clamp(a, 0.0, 1.0));
    } else {
      // Ground decal (scorch / frost): ragged blotch.
      float m = 1.0 - smoothstep(0.35, 1.0, r + (n - 0.5) * 0.9);
      float a = m * vCol.a;
      if (a < 0.005) discard;
      gl_FragColor = vec4(vCol.rgb * (0.8 + 0.4 * n), a);
    }
  }
`;

const dummy = new THREE.Object3D();
const tmp = new THREE.Color();

/**
 * Pool of soft, noise-shaded sprites in one instanced draw call: smoke puffs, rolling fireballs
 * or flat ground decals. Each particle fades in quickly and out slowly.
 */
export class SoftPool {
  readonly mesh: THREE.InstancedMesh;
  private head = 0;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private delay: Float32Array;
  private size: Float32Array;
  private grow: Float32Array;
  private drag: Float32Array;
  private baseAlpha: Float32Array;
  private col: THREE.InstancedBufferAttribute;
  private misc: THREE.InstancedBufferAttribute;

  constructor(
    readonly n: number,
    readonly mode: SoftMode,
  ) {
    const geo = new THREE.PlaneGeometry(1, 1);
    this.col = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.misc = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCol', this.col);
    geo.setAttribute('aMisc', this.misc);
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uFlat: { value: mode === 'decal' || mode === 'shockwave' ? 1 : 0 },
        uMode: { value: { smoke: 0, fireball: 1, decal: 2, shockwave: 3 }[mode] },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: mode === 'shockwave' ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
    });
    if (mode === 'decal') {
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = -2;
    }
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = mode === 'decal' ? 1 : mode === 'shockwave' ? 2 : mode === 'smoke' ? 4 : 3;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.maxLife = new Float32Array(n);
    this.delay = new Float32Array(n);
    this.size = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.baseAlpha = new Float32Array(n);
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, dummy.matrix);
  }

  spawn(p: SoftSpec) {
    const i = this.head;
    this.head = (this.head + 1) % this.n;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([p.vx ?? 0, p.vy ?? 0, p.vz ?? 0], i * 3);
    this.life[i] = this.maxLife[i] = p.life;
    this.delay[i] = p.delay ?? 0;
    this.size[i] = p.size;
    this.grow[i] = p.grow ?? 1;
    this.drag[i] = p.drag ?? 0;
    this.baseAlpha[i] = p.alpha ?? 1;
    tmp.set(p.color);
    this.col.setXYZW(i, tmp.r, tmp.g, tmp.b, 0);
    this.misc.setXY(i, Math.random(), p.kind ?? 0);
  }

  update(dt: number) {
    (this.mesh.material as THREE.ShaderMaterial).uniforms.uTime.value += dt;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      if (this.delay[i] > 0) {
        this.delay[i] -= dt;
        continue;
      }
      this.life[i] -= dt;
      const o = i * 3;
      if (this.life[i] <= 0) {
        dummy.scale.setScalar(0);
        dummy.updateMatrix();
        this.mesh.setMatrixAt(i, dummy.matrix);
        this.col.setW(i, 0);
        continue;
      }
      const k = 1 - this.life[i] / this.maxLife[i];
      const dr = Math.max(0, 1 - this.drag[i] * dt);
      for (let a = 0; a < 3; a++) {
        this.vel[o + a] *= dr;
        this.pos[o + a] += this.vel[o + a] * dt;
      }
      const s = this.size[i] * (1 + (this.grow[i] - 1) * (1 - Math.pow(1 - k, 2)));
      dummy.position.set(this.pos[o], this.pos[o + 1], this.pos[o + 2]);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      this.mesh.setMatrixAt(i, dummy.matrix);
      // Envelope: quick fade-in, long fade-out (fireballs burn out from full heat).
      const env =
        this.mode === 'fireball' ? 1 - k : this.mode === 'shockwave' ? Math.pow(1 - k, 1.5) : this.mode === 'decal' ? 1 - Math.pow(k, 3) : Math.min(1, k / 0.12) * Math.pow(1 - k, 1.3);
      this.col.setW(i, this.baseAlpha[i] * env);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.col.needsUpdate = true;
    this.misc.needsUpdate = true;
  }
}
