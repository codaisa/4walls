import { useFrame, useThree } from '@react-three/fiber';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * V0 (performance): a fixed pool of real point lights fed by any number of "virtual" lights.
 *
 * Every point light in three.js is evaluated by every lit material, and changing how many lights
 * exist recompiles every shader (a visible stall). Scene props (campfires, braziers, totems, torches,
 * keys…) now declare virtual lights; each frame the pool lights the strongest ones near the middle
 * of the screen with a constant number of real lights (2 / 4 / 6 by quality). Far or off-screen
 * fires keep their glowing flames — they just stop lighting the floor around them.
 */
export class VirtualLight extends THREE.Object3D {
  readonly isVirtualLight = true;
  color = new THREE.Color('#ffffff');
  intensity = 1;
  distance = 5;
  decay = 2;
}

const sources = new Set<VirtualLight>();

type Props = { color?: THREE.ColorRepresentation; intensity?: number; distance?: number; decay?: number; position?: [number, number, number] };

/** Drop-in for <pointLight> on scene props: same props, the ref is a VirtualLight. */
export const PooledLight = forwardRef<VirtualLight, Props>(function PooledLight({ color = '#ffffff', intensity = 1, distance = 5, decay = 2, position }, ref) {
  const light = useMemo(() => new VirtualLight(), []);
  useImperativeHandle(ref, () => light, [light]);
  useEffect(() => {
    light.color.set(color);
    light.distance = distance;
    light.decay = decay;
  }, [light, color, distance, decay]);
  // Intensity is often animated by the owner through the ref: only set it from props on mount/changes.
  useEffect(() => {
    light.intensity = intensity;
  }, [light, intensity]);
  useEffect(() => {
    sources.add(light);
    return () => {
      sources.delete(light);
    };
  }, [light]);
  return <primitive object={light} position={position ?? [0, 0, 0]} />;
});

const worldVisible = (o: THREE.Object3D) => {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
  return true;
};

/** The real lights. Mounted once per scene; their number never changes while playing. */
export function LightPool({ count }: { count: number }) {
  const lights = useRef<(THREE.PointLight | null)[]>([]);
  const camera = useThree((s) => s.camera);
  const scratch = useMemo(() => ({ p: new THREE.Vector3(), focus: new THREE.Vector3(), dir: new THREE.Vector3(), list: [] as { l: VirtualLight; score: number; pos: THREE.Vector3 }[] }), []);
  useFrame(() => {
    // Where the camera looks on the ground: lights near there matter most.
    camera.getWorldDirection(scratch.dir);
    const t = scratch.dir.y < -0.05 ? -camera.position.y / scratch.dir.y : 10;
    scratch.focus.copy(camera.position).addScaledVector(scratch.dir, t);
    const list = scratch.list;
    list.length = 0;
    for (const l of sources) {
      if (l.intensity <= 0.001 || !worldVisible(l)) continue;
      const pos = l.getWorldPosition(new THREE.Vector3());
      const d = Math.hypot(pos.x - scratch.focus.x, pos.z - scratch.focus.z);
      if (d > 22) continue;
      list.push({ l, pos, score: l.intensity * (l.distance + 1) / (1 + (d / 6) ** 2) });
    }
    list.sort((a, b) => b.score - a.score);
    for (let i = 0; i < count; i++) {
      const real = lights.current[i];
      if (!real) continue;
      const src = list[i];
      if (!src) {
        real.intensity = 0;
        continue;
      }
      real.position.copy(src.pos);
      real.color.copy(src.l.color);
      real.intensity = src.l.intensity;
      real.distance = src.l.distance;
      real.decay = src.l.decay;
    }
  });
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <pointLight key={i} ref={(l) => void (lights.current[i] = l)} intensity={0} distance={5} />
      ))}
    </>
  );
}
