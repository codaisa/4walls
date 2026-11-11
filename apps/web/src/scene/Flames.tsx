import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Dir } from '@4walls/shared';
import { clamp01, useGame } from './context';
import { FIRE_STYLE, STYLED_RAMP_GLSL } from './Cosmetics';
import { BILLBOARD_UPRIGHT_GLSL, NOISE_GLSL, RAMP_GLSL } from './vfxShaders';

const MAX_CELLS = 400;
const MAX_TONGUES = MAX_CELLS * 3;
const dummy = new THREE.Object3D();
const KIND = { normal: 0, fire: 1, ice: 2 } as const;
/** Rotation (about Y) that points the floor strip's +X (its uv.x) outward along the arm. */
const DIR_ANGLE: Record<Dir, number> = { right: 0, left: Math.PI, down: -Math.PI / 2, up: Math.PI / 2 };

// ───────────────────────── fire tongues (upright billboards) ─────────────────────────

const tongueVertex = /* glsl */ `
  attribute vec4 aData; // intensity, kind, seed, age
  varying vec2 vUv;
  varying vec4 vData;
  ${BILLBOARD_UPRIGHT_GLSL}
  void main() {
    vUv = uv;
    vData = aData;
    vec3 center = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float sx = length(instanceMatrix[0].xyz);
    float sy = length(instanceMatrix[1].xyz);
    gl_Position = projectionMatrix * viewMatrix * vec4(billboardUpright(center, sx, sy), 1.0);
  }
`;

const tongueFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec4 vData;
  ${NOISE_GLSL}
  ${RAMP_GLSL}
  ${STYLED_RAMP_GLSL}
  void main() {
    float inten = vData.x;
    float kind = vData.y;
    float seed = vData.z;
    float age = vData.w;
    float speed = kind > 1.5 ? 1.2 : (kind > 0.5 ? 2.6 : 3.4);
    float t = uTime * speed + seed * 23.0;
    // Classic procedural flame: a teardrop distance field eaten away by upward-scrolling fbm.
    // q is scaled so the flame body fills the whole sprite (wide base, wispy top).
    vec2 q = vec2((vUv.x - 0.5) * 0.36, vUv.y * 1.4 - 0.25);
    float n = vfxFbm(vec2(vUv.x * 1.6, vUv.y * 2.6) + vec2(seed * 7.0, -t));
    float d = length(q * vec2(1.8 + q.y * 1.5, 0.75)) - n * max(0.0, q.y + 0.25);
    float c = 1.0 - 16.0 * pow(max(0.0, d), 1.2);
    float heat = clamp(n * c * (1.5 - pow(1.25 * vUv.y, 4.0)), 0.0, 1.0);
    float alpha = clamp(c * (1.0 - pow(vUv.y, 3.0)), 0.0, 1.0) * inten;
    if (kind < 0.5) heat = clamp(heat - age * 0.3, 0.0, 1.0);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(styledRamp(heat, max(kind, 0.0), max(-kind, 0.0)) * 0.6, alpha);
  }
`;

// ───────────────────────── fire on the floor (flowing strips) ─────────────────────────

const floorVertex = /* glsl */ `
  attribute vec4 aData; // intensity, kind, seed, age
  attribute float aPart; // 0 center, 1 arm, 2 end
  varying vec2 vUv;
  varying vec4 vData;
  varying float vPart;
  void main() {
    vUv = uv;
    vData = aData;
    vPart = aPart;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const floorFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec4 vData;
  varying float vPart;
  ${NOISE_GLSL}
  ${RAMP_GLSL}
  ${STYLED_RAMP_GLSL}
  void main() {
    float inten = vData.x;
    float kind = vData.y;
    float seed = vData.z;
    float age = vData.w;
    float t = uTime * (kind > 1.5 ? 0.6 : 2.4) + seed * 11.0;
    vec2 uv = vUv;
    float mask;
    float ring = 0.0;
    if (vPart < 0.5) {
      // Center: churning disk + a shockwave ring racing outward at the start.
      vec2 d = uv - 0.5;
      float r = length(d) * 2.0;
      float n = vfxFbm(d * 3.5 + vec2(t * 0.6, -t * 0.4));
      mask = 1.0 - smoothstep(0.5, 1.0, r + (n - 0.5) * 0.5);
      if (kind < 0.5) ring = exp(-pow((r - age * 3.2) * 6.0, 2.0)) * (1.0 - age) * 1.4;
    } else {
      // Arms: fire streaming outward from the bomb along uv.x.
      float n = vfxFbm(vec2(uv.x * 2.2 - t * 1.3, uv.y * 3.0 + seed * 5.0));
      float side = abs(uv.y - 0.5) * 2.0 + (n - 0.5) * 0.45;
      mask = 1.0 - smoothstep(0.45, 0.95, side);
      if (vPart > 1.5) mask *= 1.0 - smoothstep(0.35, 0.95, uv.x + (n - 0.5) * 0.3);
    }
    float f = mask * inten;
    float heat = clamp(f * 0.75 + ring - age * 0.2, 0.0, 1.0);
    float alpha = smoothstep(0.03, 0.35, f) + ring * 0.6;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(styledRamp(heat, max(kind, 0.0), max(-kind, 0.0)) * 0.55, clamp(alpha, 0.0, 1.0));
  }
`;

const hash = (a: number, b: number, c: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Explosion fire: noise-shaded flame tongues standing on every burning cell plus a flowing
 * sheet of fire along the floor that connects the blast arms. Additive + bloom.
 */
export function Flames() {
  const { controller, ox, oz } = useGame();
  const tongues = useRef<THREE.InstancedMesh>(null!);
  const floor = useRef<THREE.InstancedMesh>(null!);

  const { tongueGeo, floorGeo, tongueMat, floorMat, tongueData, floorData, floorPart } = useMemo(() => {
    const tongueGeo = new THREE.PlaneGeometry(1, 1);
    const floorGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const common = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false };
    const tongueMat = new THREE.ShaderMaterial({ vertexShader: tongueVertex, fragmentShader: tongueFragment, uniforms: { uTime: { value: 0 } }, ...common });
    const floorMat = new THREE.ShaderMaterial({ vertexShader: floorVertex, fragmentShader: floorFragment, uniforms: { uTime: { value: 0 } }, ...common });
    const tongueData = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TONGUES * 4), 4);
    const floorData = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CELLS * 4), 4);
    const floorPart = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CELLS), 1);
    for (const a of [tongueData, floorData, floorPart]) a.setUsage(THREE.DynamicDrawUsage);
    tongueGeo.setAttribute('aData', tongueData);
    floorGeo.setAttribute('aData', floorData);
    floorGeo.setAttribute('aPart', floorPart);
    return { tongueGeo, floorGeo, tongueMat, floorMat, tongueData, floorData, floorPart };
  }, []);

  const styleOf = (ownerId: string) => controller.state.config.players.find((p) => p.id === ownerId)?.loadout?.fire;

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    tongueMat.uniforms.uTime.value = time;
    floorMat.uniforms.uTime.value = time;
    const s = controller.state;
    const tickF = controller.tickF;
    let nf = 0;
    let nt = 0;
    for (const f of s.flames) {
      if (nf >= MAX_CELLS) break;
      if (f.style === 'root') continue; // drawn as root spikes (RootSpikes.tsx)
      const life = f.untilTick - f.bornTick;
      const k = clamp01((tickF - f.bornTick) / life);
      if (k >= 1) continue;
      const lingering = f.kind === 'fire';
      // Fast burst, then fade (lingering hellfire lives ~5× longer and fades only at the end).
      const grow = clamp01(k / (lingering ? 0.03 : 0.08));
      const fade = 1 - clamp01((k - (lingering ? 0.85 : 0.55)) / (lingering ? 0.15 : 0.45));
      const inten = grow * fade;
      // Normal flames carry the owner's explosion palette as a negative kind (-style).
      const style = f.kind === 'normal' ? (FIRE_STYLE[styleOf(f.ownerId) ?? ''] ?? 0) : 0;
      const kind = style ? -style : KIND[f.kind];
      const wx = f.x + ox;
      const wz = f.y + oz;

      // Floor strip.
      const center = f.part === 'center' || !f.dir;
      dummy.position.set(wx, 0.035 + (center ? 0.004 : 0), wz);
      dummy.rotation.set(0, center ? 0 : DIR_ANGLE[f.dir!], 0);
      const reach = 0.65 + 0.35 * grow;
      if (center) dummy.scale.set(1.25 * reach, 1, 1.25 * reach);
      else dummy.scale.set(f.part === 'end' ? 1.0 : 1.08, 1, 0.95);
      // Arms overlap toward the center so the strip reads as one continuous blast ray.
      if (!center) dummy.position.add(new THREE.Vector3(-0.04, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, DIR_ANGLE[f.dir!]));
      dummy.updateMatrix();
      floor.current.setMatrixAt(nf, dummy.matrix);
      floorData.setXYZW(nf, inten, kind, hash(f.x, f.y, 0), k);
      floorPart.setX(nf, center ? 0 : f.part === 'end' ? 2 : 1);
      nf++;

      // Tongues: three on the blast center, two along arms, one at the tips.
      const count = center ? 3 : f.part === 'end' ? 1 : 2;
      const baseH = lingering ? 1.25 : f.kind === 'ice' ? 0.95 : 1.65;
      for (let j = 0; j < count && nt < MAX_TONGUES; j++) {
        const h = hash(f.x, f.y, j + 1);
        let px = wx;
        let pz = wz;
        if (center) {
          const a = (j / count) * Math.PI * 2 + h;
          px += Math.cos(a) * 0.2;
          pz += Math.sin(a) * 0.2;
        } else {
          const along = count === 1 ? -0.1 : j === 0 ? -0.24 : 0.22;
          const v = new THREE.Vector3(along, 0, (h - 0.5) * 0.25).applyAxisAngle(THREE.Object3D.DEFAULT_UP, DIR_ANGLE[f.dir!]);
          px += v.x;
          pz += v.z;
        }
        // Each tongue breathes on its own rhythm.
        const breathe = 0.85 + 0.15 * Math.sin(time * (7 + h * 5) + h * 20);
        // Size settles quickly; fading happens through opacity so flames never shrink to slivers.
        const hgt = baseH * (center ? 1.15 : f.part === 'end' ? 0.85 : 1) * (0.75 + 0.5 * h) * (0.55 + 0.45 * Math.min(1, grow * 1.5)) * breathe;
        const wid = (center ? 1.1 : 0.95) * (0.8 + 0.4 * hash(f.x, f.y, j + 9));
        dummy.position.set(px, 0, pz);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(Math.max(wid, 1e-4), Math.max(hgt, 1e-4), 1);
        dummy.updateMatrix();
        tongues.current.setMatrixAt(nt, dummy.matrix);
        tongueData.setXYZW(nt, inten, kind, h, k);
        nt++;
      }
    }
    floor.current.count = nf;
    tongues.current.count = nt;
    floor.current.instanceMatrix.needsUpdate = true;
    tongues.current.instanceMatrix.needsUpdate = true;
    floorData.needsUpdate = true;
    floorPart.needsUpdate = true;
    tongueData.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={floor} args={[floorGeo, floorMat, MAX_CELLS]} frustumCulled={false} renderOrder={2} />
      <instancedMesh ref={tongues} args={[tongueGeo, tongueMat, MAX_TONGUES]} frustumCulled={false} renderOrder={3} />
    </>
  );
}
