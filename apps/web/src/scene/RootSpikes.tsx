import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { clamp01, useGame } from './context';

const MAX_CELLS = 220;
const PER_CELL = 3;
const dummy = new THREE.Object3D();

const hash = (a: number, b: number, c: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Guardião's roots: gnarled spikes burst out of the floor on every root "flame" (they kill like
 * fire), hold for a moment and sink back. Bark body with glowing green tips.
 */
export function RootSpikes() {
  const { controller, ox, oz } = useGame();
  const spikes = useRef<THREE.InstancedMesh>(null!);
  const tips = useRef<THREE.InstancedMesh>(null!);
  const { spikeGeo, tipGeo, bark, glow } = useMemo(() => {
    const spikeGeo = new THREE.ConeGeometry(0.16, 1, 6, 3).translate(0, 0.5, 0);
    // Gnarl the cone a little so every spike looks like a twisted root.
    const pos = spikeGeo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      pos.setX(i, pos.getX(i) + Math.sin(y * 7) * 0.035);
      pos.setZ(i, pos.getZ(i) + Math.cos(y * 5) * 0.03);
    }
    spikeGeo.computeVertexNormals();
    const tipGeo = new THREE.ConeGeometry(0.06, 0.22, 5).translate(0, 0.11, 0);
    return {
      spikeGeo,
      tipGeo,
      bark: new THREE.MeshStandardMaterial({ color: '#5a3b22', roughness: 0.95, flatShading: true }),
      glow: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 3.2, 0.6), toneMapped: false }),
    };
  }, []);

  useFrame(() => {
    const s = controller.state;
    const tickF = controller.tickF;
    let n = 0;
    for (const f of s.flames) {
      if (f.style !== 'root' || n >= MAX_CELLS * PER_CELL) continue;
      const life = Math.max(1, f.untilTick - f.bornTick);
      const k = clamp01((tickF - f.bornTick) / life);
      if (k >= 1) continue;
      // Shoot up fast, hold, sink back at the end.
      const rise = clamp01(k / 0.1);
      const sink = 1 - clamp01((k - 0.75) / 0.25);
      const h = Math.pow(rise, 0.5) * sink;
      for (let j = 0; j < PER_CELL; j++) {
        const r = hash(f.x, f.y, j);
        const a = (j / PER_CELL) * Math.PI * 2 + r * 2;
        const x = f.x + ox + Math.cos(a) * 0.22 * (j ? 1 : 0.2);
        const z = f.y + oz + Math.sin(a) * 0.22 * (j ? 1 : 0.2);
        const height = (j === 0 ? 1.15 : 0.7 + r * 0.35) * h;
        dummy.position.set(x, -0.05, z);
        dummy.rotation.set((r - 0.5) * 0.5, r * 6, (hash(f.y, f.x, j) - 0.5) * 0.5);
        dummy.scale.set(1, Math.max(height, 1e-4), 1);
        dummy.updateMatrix();
        spikes.current.setMatrixAt(n, dummy.matrix);
        // Glowing tip rides on top of the spike.
        dummy.position.y = -0.05 + height * 0.92;
        dummy.scale.setScalar(Math.max(h, 1e-4));
        dummy.updateMatrix();
        tips.current.setMatrixAt(n, dummy.matrix);
        n++;
      }
    }
    spikes.current.count = n;
    tips.current.count = n;
    spikes.current.instanceMatrix.needsUpdate = true;
    tips.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={spikes} args={[spikeGeo, bark, MAX_CELLS * PER_CELL]} frustumCulled={false} castShadow />
      <instancedMesh ref={tips} args={[tipGeo, glow, MAX_CELLS * PER_CELL]} frustumCulled={false} />
    </>
  );
}
