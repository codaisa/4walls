import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { regionAt, type RegionVariant } from '@4walls/core';
import { FloatingParticles } from './Arena';
import { useGame } from './context';
import type { ArenaTheme } from './themes';

/**
 * Mood of the region the group stands in. Later laps of the biome cycle come back at night, in
 * mist or corrupted: the scene's sky, fog and lights glide toward the variant's look (no pop), the
 * lava shader's own fog follows, and each mood brings its particles (fireflies in the dark, low
 * wisps in the mist, violet motes over the corruption). At night a lantern follows the group.
 */
interface Mood {
  sky: string;
  /** Fog start / end as multiples of the camera's distance to the group (null: the theme's). */
  fog: [number, number] | null;
  /** Multiplier for the sun / rim / hemisphere / ambient intensities. */
  light: number;
  /** Tint mixed into the sun's color. */
  tint: string | null;
  lantern: number;
}
const MOODS: Record<RegionVariant, Mood> = {
  normal: { sky: '', fog: null, light: 1, tint: null, lantern: 0 },
  night: { sky: '#060914', fog: [0.8, 1.9], light: 0.3, tint: '#8fb0ff', lantern: 1 },
  mist: { sky: '#8a959b', fog: [0.6, 1.75], light: 0.82, tint: '#dfe8ec', lantern: 0 },
  corrupted: { sky: '#1a0a26', fog: [0.85, 2.2], light: 0.72, tint: '#c49bff', lantern: 0 },
};

type Base = { intensity: number; color: THREE.Color };

export function AdventureAtmosphere({ theme }: { theme: ArenaTheme }) {
  const { controller } = useGame();
  const scene = useThree((s) => s.scene);
  const [variant, setVariant] = useState<RegionVariant>('normal');
  const lantern = useRef<THREE.PointLight>(null!);
  const mix = useRef({ k: 0, from: 'normal' as RegionVariant, to: 'normal' as RegionVariant });
  const base = useRef(new Map<THREE.Light, Base>());
  const shaders = useRef<THREE.ShaderMaterial[]>([]);
  const frame = useRef(0);
  const tmp = useRef({ sky: new THREE.Color(), a: new THREE.Color(), b: new THREE.Color() });

  const focus = useRef(new THREE.Vector3());
  // Leave the lights as they were found (quality changes rebuild the canvas; dev reloads remount).
  useEffect(
    () => () => {
      for (const [l, v] of base.current) {
        l.intensity = v.intensity;
        l.color.copy(v.color);
      }
    },
    [],
  );
  useFrame(({ camera }, dt) => {
    const s = controller.state;
    const adv = s.adventure;
    if (!adv) return;
    // Where the group is: the lead living player's region (corridors keep the last one).
    const alive = s.players.filter((p) => p.alive);
    const lead = alive[0] ?? s.players[0];
    const rid = lead ? regionAt(s, lead.x, lead.y) : -1;
    const region = adv.regions.find((r) => r.id === rid);
    const m = mix.current;
    if (region && region.variant !== m.to) {
      m.from = m.k > 0.5 ? m.to : m.from;
      m.to = region.variant;
      m.k = 0;
      setVariant(region.variant);
    }
    m.k = Math.min(1, m.k + dt / 2.2);
    const e = m.k * m.k * (3 - 2 * m.k);
    const A = MOODS[m.from];
    const B = MOODS[m.to];

    // Lights: remember each one's own values the first time it is seen.
    if (frame.current++ % 30 === 0) {
      const found: THREE.ShaderMaterial[] = [];
      scene.traverse((o) => {
        if ((o as THREE.Light).isLight && !(o as THREE.PointLight).isPointLight && !base.current.has(o as THREE.Light)) {
          const l = o as THREE.Light;
          base.current.set(l, { intensity: l.intensity, color: l.color.clone() });
        }
        const mat = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
        if (mat && (mat as THREE.ShaderMaterial).uniforms?.uFogColor) found.push(mat);
      });
      shaders.current = found;
    }
    const light = A.light + (B.light - A.light) * e;
    const { sky, a, b } = tmp.current;
    for (const [l, v] of base.current) {
      l.intensity = v.intensity * light;
      a.copy(v.color);
      b.copy(v.color);
      if (A.tint) a.lerp(sky.set(A.tint), 0.55);
      if (B.tint) b.lerp(sky.set(B.tint), 0.55);
      l.color.copy(a.lerp(b, e));
    }
    // Sky and fog.
    a.set(A.sky || theme.background);
    b.set(B.sky || theme.background);
    sky.copy(a.lerp(b, e));
    if (scene.background instanceof THREE.Color) scene.background.copy(sky);
    // Fog scales with the zoom (the close camera sits much nearer than the wide one).
    if (alive.length) focus.current.set(alive.reduce((n, p) => n + p.x, 0) / alive.length, 0, alive.reduce((n, p) => n + p.y, 0) / alive.length);
    const dist = camera.position.distanceTo(focus.current);
    const fogOf = (mo: Mood): [number, number] => (mo.fog ? [mo.fog[0] * dist, mo.fog[1] * dist] : theme.fog);
    const fa = fogOf(A);
    const fb = fogOf(B);
    const near = fa[0] + (fb[0] - fa[0]) * e;
    const far = fa[1] + (fb[1] - fa[1]) * e;
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(sky);
      scene.fog.near = near;
      scene.fog.far = far;
    }
    for (const mat of shaders.current) {
      (mat.uniforms.uFogColor.value as THREE.Color).copy(sky);
      if (mat.uniforms.uFogNear) mat.uniforms.uFogNear.value = near;
      if (mat.uniforms.uFogFar) mat.uniforms.uFogFar.value = far;
    }
    // The night lantern hovers over the group.
    const lan = A.lantern + (B.lantern - A.lantern) * e;
    lantern.current.intensity = lan * 7;
    lantern.current.visible = lan > 0.01;
    if (alive.length) {
      const cx = alive.reduce((n, p) => n + p.x, 0) / alive.length;
      const cz = alive.reduce((n, p) => n + p.y, 0) / alive.length;
      lantern.current.position.set(cx, 3.2, cz + 0.6);
    }
  });

  return (
    <>
      <pointLight ref={lantern} color="#ffd59a" intensity={0} distance={8} decay={1.4} visible={false} />
      {variant === 'night' && <FloatingParticles key="night" count={120} color={[2.4, 2.1, 0.7]} size={0.1} rise={[-0.12, 0.12]} wander={0.8} blink />}
      {variant === 'mist' && <MistWisps />}
      {variant === 'corrupted' && <FloatingParticles key="corrupt" count={180} color={[1.6, 0.35, 2.4]} size={0.08} rise={[0.15, 0.6]} wander={0.5} />}
    </>
  );
}

/** Low banks of mist drifting over the ground around the camera's focus (soft round sprites). */
function MistWisps() {
  const group = useRef<THREE.Group>(null!);
  const mat = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: '#e4ecef', transparent: true, opacity: 0.22, depthWrite: false, fog: false });
  }, []);
  const wisps = useMemo(() => Array.from({ length: 22 }, (_, i) => ({ x: (Math.random() - 0.5) * 26, z: (Math.random() - 0.5) * 18, y: 0.4 + Math.random() * 0.9, s: 3.5 + Math.random() * 3.5, v: 0.25 + Math.random() * 0.35, ph: i })), []);
  useFrame(({ camera, clock }, dt) => {
    const cx = camera.position.x;
    const cz = camera.position.z - 9;
    group.current.children.forEach((o, i) => {
      const w = wisps[i];
      w.x += w.v * dt;
      if (w.x > 13) w.x = -13;
      o.position.set(cx + w.x, w.y + Math.sin(clock.elapsedTime * 0.4 + w.ph) * 0.15, cz + w.z);
      const m = (o as THREE.Sprite).material as THREE.SpriteMaterial;
      m.opacity = 0.11 + 0.06 * Math.sin(clock.elapsedTime * 0.3 + w.ph);
    });
  });
  // One material per sprite so each can breathe on its own.
  const mats = useMemo(() => wisps.map(() => mat.clone()), [mat, wisps]);
  return (
    <group ref={group}>
      {wisps.map((w, i) => (
        <sprite key={i} material={mats[i]} scale={[w.s, w.s * 0.45, 1]} />
      ))}
    </group>
  );
}
